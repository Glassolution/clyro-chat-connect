import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "@/lib/clyro-types";

/**
 * As mensagens mais recentes de todas as conversas de uma vez, para a lista
 * mostrar a prévia, a hora e quantas chegaram desde a última visita. Uma busca
 * só, cortada em 400 linhas: quem conversa muito numa conversa pode empurrar
 * outra mais antiga para fora, e aí ela aparece sem prévia — nada quebra.
 */
export function useRecentDirectMessages(conversationIds: string[]) {
  const ids = [...conversationIds].sort();
  return useQuery({
    enabled: ids.length > 0,
    queryKey: ["dm-recent", ids.join(",")],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, channel_id, conversation_id, author_id, content, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      const byConversation = new Map<string, Message[]>();
      for (const row of (data ?? []) as Message[]) {
        if (!row.conversation_id) continue;
        const list = byConversation.get(row.conversation_id) ?? [];
        list.push(row);
        byConversation.set(row.conversation_id, list);
      }
      return byConversation;
    },
  });
}

/*
 * "Visto por último" mora só neste navegador: é uma conveniência de quem lê,
 * não um recibo de leitura. Sem acesso ao armazenamento, tudo conta como lido.
 */
const SEEN_KEY = "clyro:dm-seen";
const listeners = new Set<() => void>();
let cache: Record<string, string> | null = null;

function readSeen(): Record<string, string> {
  if (cache) return cache;
  try {
    cache = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, string>;
  } catch {
    cache = {};
  }
  return cache;
}

const EMPTY: Record<string, string> = {};

export function markConversationSeen(conversationId: string, at: string) {
  const current = readSeen();
  if (current[conversationId] && current[conversationId] >= at) return;
  cache = { ...current, [conversationId]: at };
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(cache));
  } catch {
    // sem armazenamento a marca vale só até recarregar
  }
  listeners.forEach((fn) => fn());
}

export function useSeenMap() {
  const subscribe = useCallback((fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => readSeen(),
    () => EMPTY,
  );
}
