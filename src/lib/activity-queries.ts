import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VoiceState } from "@/lib/clyro-types";

export type TaskStatus = "todo" | "doing" | "done";

export type Task = {
  id: string;
  server_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  created_by: string;
  assignee_id: string | null;
  due_at: string | null;
  created_at: string;
  completed_at: string | null;
};

export type Meeting = {
  id: string;
  server_id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  channel_id: string | null;
  created_by: string;
  created_at: string;
};

export type RecentMessage = {
  id: string;
  author_id: string;
  channel_id: string;
  content: string;
  created_at: string;
};

/**
 * Sem a migração de tasks e reuniões a tabela não existe: em vez de quebrar,
 * a consulta devolve `missing` e o painel mostra como ativar.
 */
function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
}

export function useTasks(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["tasks", serverId],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("server_id", serverId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (isMissingTable(error)) return { missing: true as const, tasks: [] as Task[] };
      if (error) throw error;
      return { missing: false as const, tasks: (data ?? []) as Task[] };
    },
  });
}

export function useMeetings(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["meetings", serverId],
    retry: 1,
    queryFn: async () => {
      // Desde uma hora atrás: a reunião que está acontecendo continua na lista.
      const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("server_id", serverId as string)
        .gte("starts_at", from)
        .order("starts_at")
        .limit(30);
      if (isMissingTable(error)) return { missing: true as const, meetings: [] as Meeting[] };
      if (error) throw error;
      return { missing: false as const, meetings: (data ?? []) as Meeting[] };
    },
  });
}

/** As últimas mensagens dos canais de texto do workspace. */
export function useRecentMessages(channelIds: string[]) {
  return useQuery({
    enabled: channelIds.length > 0,
    queryKey: ["recent-messages", channelIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, author_id, channel_id, content, created_at")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) return [] as RecentMessage[];
      return (data ?? []) as RecentMessage[];
    },
    refetchInterval: 60_000,
  });
}

/** Tasks e reuniões chegam sozinhas: qualquer mudança no workspace recarrega. */
export function useActivityRealtime(serverId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!serverId) return;
    // Nome único por montagem: o supabase devolve o canal existente para o
    // mesmo nome, e o anterior ainda pode estar saindo quando o efeito remonta.
    const channel = supabase
      .channel(`activity:${serverId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `server_id=eq.${serverId}` },
        () => void qc.invalidateQueries({ queryKey: ["tasks", serverId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings", filter: `server_id=eq.${serverId}` },
        () => void qc.invalidateQueries({ queryKey: ["meetings", serverId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [serverId, qc]);
}

export function useTaskActions(serverId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks", serverId] });
  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      createdBy: string;
      assigneeId: string | null;
      dueAt?: string | null;
    }) => {
      const { error } = await supabase.from("tasks").insert({
        server_id: serverId,
        title: input.title.trim(),
        created_by: input.createdBy,
        assignee_id: input.assigneeId,
        due_at: input.dueAt ?? null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    // Marca na hora; se falhar, a consulta volta ao estado do banco.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["tasks", serverId] });
      qc.setQueryData<{ missing: boolean; tasks: Task[] }>(["tasks", serverId], (old) =>
        old ? { ...old, tasks: old.tasks.map((t) => (t.id === id ? { ...t, status } : t)) } : old,
      );
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { create, setStatus, remove };
}

export function useMeetingActions(serverId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["meetings", serverId] });
  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      startsAt: string;
      durationMin: number;
      channelId: string | null;
      createdBy: string;
    }) => {
      const { error } = await supabase.from("meetings").insert({
        server_id: serverId,
        title: input.title.trim(),
        starts_at: input.startsAt,
        duration_min: input.durationMin,
        channel_id: input.channelId,
        created_by: input.createdBy,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { create, remove };
}

export type VoiceJoin = { userId: string; channelId: string; at: number };

/*
 * Quem entrou em call enquanto o app está aberto. A presença de voz diz quem
 * está na sala agora, não desde quando; o registro guarda a hora em que cada
 * entrada foi vista, e sobrevive à troca de abas.
 */
const voiceLog: VoiceJoin[] = [];

export function useVoiceJoins(states: VoiceState[], channelIds: Set<string>) {
  const seen = useRef<Set<string> | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    const now = new Set(
      states
        .filter((s) => s.channel_id && channelIds.has(s.channel_id))
        .map((s) => `${s.user_id}:${s.channel_id}`),
    );
    // Na primeira leitura só registra quem já estava; entradas contam dali em diante.
    if (seen.current) {
      let changed = false;
      now.forEach((key) => {
        if (seen.current?.has(key)) return;
        const [userId, channelId] = key.split(":");
        if (!userId || !channelId) return;
        voiceLog.unshift({ userId, channelId, at: Date.now() });
        changed = true;
      });
      if (voiceLog.length > 30) voiceLog.length = 30;
      if (changed) bump((n) => n + 1);
    }
    seen.current = now;
  }, [states, channelIds]);
  return voiceLog.filter((j) => channelIds.has(j.channelId));
}
