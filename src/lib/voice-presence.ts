import { supabase } from "@/integrations/supabase/client";

/**
 * Quem está em qual call é publicado em `voice_states`, para quem está de fora
 * da chamada também enxergar a sala cheia. O registro carrega um sinal de vida:
 * é o que impede uma aba fechada de qualquer jeito de deixar a pessoa na lista
 * para sempre.
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

/** De quanto em quanto tempo o sinal de vida é renovado. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

function rowOf(presence: VoicePresence) {
  return {
    user_id: presence.userId,
    channel_id: presence.channelId,
    conversation_id: presence.conversationId,
    muted: presence.muted,
    deafened: presence.deafened,
    sharing_screen: presence.sharingScreen,
    camera_on: presence.cameraOn,
  };
}

/** Coluna ausente: a migração de heartbeat ainda não rodou nesta base. */
function isMissingColumn(code: string | undefined) {
  return code === "PGRST204" || code === "42703";
}

/**
 * Publica (ou renova) a presença. O `heartbeat_at` sai da escrita quando a
 * coluna ainda não existe — sem isso o PostgREST recusaria o registro inteiro e
 * a pessoa entraria na call sem aparecer para ninguém.
 */
export async function publishVoicePresence(presence: VoicePresence) {
  const row = rowOf(presence);
  const { error } = await supabase
    .from("voice_states")
    .upsert({ ...row, heartbeat_at: new Date().toISOString() } as typeof row);
  if (!error) return null;
  if (!isMissingColumn(error.code)) return error;

  const retry = await supabase.from("voice_states").upsert(row);
  return retry.error ?? null;
}

/** Tira você da lista. Devolve o erro quando não deu para remover. */
export async function clearVoicePresence(userId: string) {
  const { error } = await supabase.from("voice_states").delete().eq("user_id", userId);
  return error ?? null;
}

/**
 * Saída de emergência com a aba fechando. O cliente do Supabase não garante que
 * um pedido iniciado agora chegue ao servidor depois que a página morre;
 * `fetch` com `keepalive` garante — e o heartbeat cobre o resto.
 */
export function clearVoicePresenceBeacon(userId: string, accessToken: string) {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!url || !key) return;
  try {
    void fetch(`${url}/rest/v1/voice_states?user_id=eq.${userId}`, {
      method: "DELETE",
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "return=minimal",
      },
    });
  } catch {
    // Melhor esforço: se não sair, o sinal de vida vence e a faxina resolve.
  }
}
