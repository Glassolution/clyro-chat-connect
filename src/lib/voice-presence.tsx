import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VoiceState } from "@/lib/clyro-types";

/**
 * Quem está em qual call, em tempo real.
 *
 * A lista morava numa tabela, e sair dependia de uma escrita chegar e de um
 * evento de realtime voltar. Quando qualquer uma das duas pontas falhava — aba
 * fechada, queda de rede, evento perdido — a pessoa ficava na sala para sempre
 * aos olhos de todo mundo. Presença resolve isso pela raiz: é o próprio
 * servidor que derruba quem desconectou, e todos os clientes recebem a lista
 * inteira a cada mudança.
 */
export type VoicePresence = {
  userId: string;
  channelId: string | null;
  conversationId: string | null;
  muted: boolean;
  deafened: boolean;
  sharingScreen: boolean;
  cameraOn: boolean;
};

/** Uma aba pode entrar em uma call só; a chave é o par usuário + aba. */
const TAB_ID = Math.random().toString(36).slice(2, 10);

type PresenceRow = VoicePresence & { tabId: string };

/**
 * Publica a sua presença (quando houver) e devolve a de todo mundo no formato
 * que a interface já consome.
 */
export function useVoicePresence(userId: string | undefined, presence: VoicePresence | null) {
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [ready, setReady] = useState(false);

  // O canal vive enquanto a sessão viver: entrar e sair de call é só mudar o
  // que está publicado, sem reabrir conexão.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("clyro-voice-presence", {
      config: { presence: { key: `${userId}__${TAB_ID}` } },
    });
    channelRef.current = channel;

    const read = () => {
      const state = channel.presenceState<PresenceRow>();
      const seen = new Map<string, PresenceRow>();
      Object.values(state).forEach((entries) => {
        entries.forEach((entry) => {
          if (entry?.userId) seen.set(`${entry.userId}__${entry.tabId}`, entry);
        });
      });
      setRows([...seen.values()]);
    };

    channel.on("presence", { event: "sync" }, read);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setReady(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setReady(false);
      }
    });

    return () => {
      setReady(false);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // O que está publicado acompanha o estado da call: mudo, surdo, tela ligada.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !ready) return;
    if (presence) void channel.track({ ...presence, tabId: TAB_ID });
    else void channel.untrack();
  }, [
    ready,
    presence?.userId,
    presence?.channelId,
    presence?.conversationId,
    presence?.muted,
    presence?.deafened,
    presence?.sharingScreen,
    presence?.cameraOn,
    presence,
  ]);

  /**
   * Mesma forma da tabela antiga, para a interface não precisar saber de onde
   * a lista veio. Duas abas do mesmo usuário viram uma linha só.
   */
  return useMemo<VoiceState[]>(() => {
    const byUser = new Map<string, VoiceState>();
    rows.forEach((row) => {
      byUser.set(row.userId, {
        user_id: row.userId,
        channel_id: row.channelId,
        conversation_id: row.conversationId,
        muted: row.muted,
        deafened: row.deafened,
        sharing_screen: row.sharingScreen,
        camera_on: row.cameraOn,
      });
    });
    return [...byUser.values()];
  }, [rows]);
}

const VoicePresenceContext = createContext<VoiceState[]>([]);

/**
 * Distribui a lista para a árvore inteira. Quem abre o canal é o app, uma vez
 * só; aqui é apenas repasse — nada de uma segunda conexão por tela.
 */
export function VoicePresenceProvider({
  value,
  children,
}: {
  value: VoiceState[];
  children: ReactNode;
}) {
  return <VoicePresenceContext.Provider value={value}>{children}</VoicePresenceContext.Provider>;
}

/** Quem está em call agora, na mesma forma que a interface sempre consumiu. */
export function useVoiceStates() {
  return useContext(VoicePresenceContext);
}
