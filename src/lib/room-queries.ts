import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Channel, Message, VoiceState } from "@/lib/clyro-types";

export type RoomSettings = {
  channel_id: string;
  server_id: string;
  created_by: string | null;
  locked: boolean;
  topic: string | null;
  created_at: string;
};

export type RoomAccessStatus = "pending" | "approved" | "denied";

export type RoomAccess = {
  channel_id: string;
  server_id: string;
  user_id: string;
  status: RoomAccessStatus;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomsData = {
  /** Sem a migração 20261116150000_room_access: toda sala conta como aberta. */
  missing: boolean;
  settings: Map<string, RoomSettings>;
  access: RoomAccess[];
};

function isMissingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the table/i.test(error.message ?? "")
  );
}

const EMPTY: RoomsData = { missing: false, settings: new Map(), access: [] };

export function useRooms(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["rooms", serverId],
    retry: 1,
    queryFn: async (): Promise<RoomsData> => {
      const [settings, access] = await Promise.all([
        supabase
          .from("room_settings")
          .select("channel_id, server_id, created_by, locked, topic, created_at")
          .eq("server_id", serverId as string),
        supabase
          .from("room_access")
          .select("channel_id, server_id, user_id, status, decided_by, created_at, updated_at")
          .eq("server_id", serverId as string),
      ]);
      if (isMissingTable(settings.error) || isMissingTable(access.error)) {
        return { missing: true, settings: new Map(), access: [] };
      }
      if (settings.error) throw settings.error;
      if (access.error) throw access.error;
      return {
        missing: false,
        settings: new Map(
          ((settings.data ?? []) as RoomSettings[]).map((row) => [row.channel_id, row]),
        ),
        access: (access.data ?? []) as RoomAccess[],
      };
    },
  });
}

export function emptyRooms() {
  return EMPTY;
}

/**
 * Sala de verdade é a que alguém abriu: tem ajustes gravados, ou nasceu bem
 * depois dos canais que vêm com o workspace (sem a migração não há ajustes, e
 * a hora de criação é o que separa a "Sala de voz" padrão das salas novas).
 */
export function isCreatedRoom(
  channel: { id: string; kind: string; created_at?: string | undefined },
  channels: { created_at?: string | undefined }[],
  rooms: RoomsData,
) {
  if (channel.kind !== "voice") return false;
  if (rooms.settings.has(channel.id)) return true;
  if (!channel.created_at) return false;
  const first = Math.min(
    ...channels.map((c) => (c.created_at ? new Date(c.created_at).getTime() : Infinity)),
  );
  return Number.isFinite(first) && new Date(channel.created_at).getTime() - first > 2 * 60_000;
}

/** Quem pode entrar direto: sala aberta, quem criou, admin ou quem foi aprovado. */
export function canEnterRoom(
  rooms: RoomsData,
  channelId: string,
  userId: string | undefined,
  isAdmin: boolean,
) {
  const settings = rooms.settings.get(channelId);
  if (!settings?.locked) return true;
  if (!userId) return false;
  if (isAdmin || settings.created_by === userId) return true;
  return rooms.access.some(
    (a) => a.channel_id === channelId && a.user_id === userId && a.status === "approved",
  );
}

export function canManageRoom(
  rooms: RoomsData,
  channelId: string,
  userId: string | undefined,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  return !!userId && rooms.settings.get(channelId)?.created_by === userId;
}

/** As últimas mensagens do chat de cada sala, para a prévia do cartão. */
export function useRecentRoomMessages(channelIds: string[]) {
  const ids = [...channelIds].sort();
  return useQuery({
    enabled: ids.length > 0,
    queryKey: ["room-recent", ids.join(",")],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, channel_id, conversation_id, author_id, content, created_at")
        .in("channel_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const byChannel = new Map<string, Message[]>();
      for (const row of (data ?? []) as Message[]) {
        if (!row.channel_id) continue;
        const list = byChannel.get(row.channel_id) ?? [];
        if (list.length < 4) list.push(row);
        byChannel.set(row.channel_id, list);
      }
      return byChannel;
    },
  });
}

export type RoomAccessEvent = {
  type: "INSERT" | "UPDATE" | "DELETE";
  row: RoomAccess;
};

/**
 * Um canal por montagem (nome com sufixo aleatório) para ajustes e pedidos do
 * workspace. Quem chama decide o que fazer com cada pedido — o app usa isso
 * para avisar quem aprova e quem pediu.
 */
export function useRoomsRealtime(
  serverId: string | null,
  onAccess?: (event: RoomAccessEvent) => void,
) {
  const qc = useQueryClient();
  const handler = useRef(onAccess);
  useEffect(() => {
    handler.current = onAccess;
  });

  useEffect(() => {
    if (!serverId) return;
    const channel = supabase
      .channel(`rooms:${serverId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_settings",
          filter: `server_id=eq.${serverId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["rooms", serverId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_access", filter: `server_id=eq.${serverId}` },
        (payload) => {
          void qc.invalidateQueries({ queryKey: ["rooms", serverId] });
          const row = (payload.new && "user_id" in payload.new ? payload.new : payload.old) as
            RoomAccess | undefined;
          if (row?.user_id) {
            handler.current?.({ type: payload.eventType as RoomAccessEvent["type"], row });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [serverId, qc]);
}

/** Criar sala, pedir para entrar, aprovar, trancar e destrancar. */
export function useRoomActions(serverId: string, userId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["rooms", serverId] });
    void qc.invalidateQueries({ queryKey: ["channels", serverId] });
  };

  const createRoom = async (input: { name: string; topic: string; locked: boolean }) => {
    if (!userId) throw new Error("Sem sessão.");
    const { data: last } = await supabase
      .from("channels")
      .select("position")
      .eq("server_id", serverId)
      .order("position", { ascending: false })
      .limit(1);
    const { data, error } = await supabase
      .from("channels")
      .insert({
        server_id: serverId,
        name: input.name.trim(),
        kind: "voice",
        position: (last?.[0]?.position ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("Não foi possível criar a sala.");
    // Sem a tabela de ajustes, a sala nasce aberta: o canal já existe e vale.
    const settings = await supabase.from("room_settings").insert({
      channel_id: data.id,
      server_id: serverId,
      created_by: userId,
      locked: input.locked,
      topic: input.topic.trim() || null,
    });
    refresh();
    return { id: data.id, settingsSaved: !settings.error };
  };

  const requestEntry = async (channelId: string) => {
    if (!userId) return;
    const { error } = await supabase.from("room_access").upsert(
      {
        channel_id: channelId,
        server_id: serverId,
        user_id: userId,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,user_id" },
    );
    refresh();
    if (error) throw error;
  };

  const cancelRequest = async (channelId: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("room_access")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId);
    refresh();
    if (error) throw error;
  };

  const decide = async (channelId: string, personId: string, approve: boolean) => {
    const { error } = await supabase
      .from("room_access")
      .update({
        status: approve ? "approved" : "denied",
        decided_by: userId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("channel_id", channelId)
      .eq("user_id", personId);
    refresh();
    if (error) throw error;
  };

  const revoke = async (channelId: string, personId: string) => {
    const { error } = await supabase
      .from("room_access")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", personId);
    refresh();
    if (error) throw error;
  };

  /** Sala antiga ainda sem ajustes: quem muda vira o dono da linha (admin). */
  const saveSettings = async (
    channelId: string,
    patch: { locked?: boolean; topic?: string | null },
    exists: boolean,
  ) => {
    const now = new Date().toISOString();
    const { error } = exists
      ? await supabase
          .from("room_settings")
          .update({ ...patch, updated_at: now })
          .eq("channel_id", channelId)
      : await supabase.from("room_settings").insert({
          channel_id: channelId,
          server_id: serverId,
          created_by: userId ?? null,
          locked: patch.locked ?? false,
          topic: patch.topic ?? null,
        });
    refresh();
    if (error) throw error;
  };

  return { createRoom, requestEntry, cancelRequest, decide, revoke, saveSettings };
}

/** Uma sala vazia some depois deste tempo. */
export const EMPTY_ROOM_TTL = 2 * 60_000;
/** Antes disso a presença ainda pode estar chegando: ninguém apaga nada. */
const PRESENCE_GRACE = 30_000;

/**
 * Salas são calls que ficam de pé enquanto tem gente. Vazia por 2 minutos, a
 * sala some da aba para todo mundo e quem pode apagar (quem criou ou o dono do
 * workspace) apaga o canal de vez, junto com o chat dela.
 *
 * "Vazia desde quando" sai da presença: a última vez que este navegador viu
 * alguém lá dentro, ou a criação da sala, o que for mais recente. Recarregar a
 * página não ressuscita sala antiga vazia, e a carência de 30 s evita apagar
 * uma sala ocupada antes da lista de presença chegar.
 */
export function useEmptyRoomSweep({
  serverId,
  channels,
  rooms,
  states,
  userId,
  isOwner,
}: {
  serverId: string | null;
  channels: Channel[];
  rooms: RoomsData;
  states: VoiceState[];
  userId: string | undefined;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const lastOccupied = useRef(new Map<string, number>());
  const attempted = useRef(new Set<string>());
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const created = useMemo(
    () => channels.filter((c) => isCreatedRoom(c, channels, rooms)),
    [channels, rooms],
  );

  // Toda vez que alguém aparece numa sala, o relógio dela zera.
  useEffect(() => {
    const t = Date.now();
    for (const s of states) if (s.channel_id) lastOccupied.current.set(s.channel_id, t);
  }, [states]);

  const expired = useMemo(() => {
    const out = new Set<string>();
    for (const room of created) {
      if (states.some((s) => s.channel_id === room.id)) continue;
      const born = room.created_at ? new Date(room.created_at).getTime() : now;
      const emptySince = Math.max(born, lastOccupied.current.get(room.id) ?? 0);
      if (now - emptySince > EMPTY_ROOM_TTL) out.add(room.id);
    }
    return out;
  }, [created, states, now]);

  useEffect(() => {
    if (!serverId || !userId || now - mountedAt < PRESENCE_GRACE) return;
    for (const id of expired) {
      if (attempted.current.has(id)) continue;
      const mine = rooms.settings.get(id)?.created_by === userId;
      if (!isOwner && !mine) continue;
      attempted.current.add(id);
      void supabase
        .from("channels")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (!error) void qc.invalidateQueries({ queryKey: ["channels", serverId] });
        });
    }
  }, [expired, serverId, userId, isOwner, rooms, now, mountedAt, qc]);

  return expired;
}
