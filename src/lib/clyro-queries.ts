import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Channel,
  Conversation,
  Friendship,
  Message,
  Profile,
  Server,
  VoiceState,
} from "@/lib/clyro-types";

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, status, activity");
      if (error) throw error;
      const map = new Map<string, Profile>();
      (data ?? []).forEach((p) => map.set(p.id, p as Profile));
      return map;
    },
  });
}

export function useServers(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["servers", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_members")
        .select("servers(id, name, icon_url, owner_id, invite_code)")
        .eq("user_id", userId as string);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { servers: Server | null }).servers)
        .filter((s): s is Server => !!s)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useChannels(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["channels", serverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, server_id, name, kind, position")
        .eq("server_id", serverId as string)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });
}

export function useServerMembers(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["server-members", serverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_members")
        .select("user_id, role")
        .eq("server_id", serverId as string);
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: string }[];
    },
  });
}

export function useConversations(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["conversations", userId],
    queryFn: async () => {
      const { data: mine, error } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", userId as string);
      if (error) throw error;
      const ids = (mine ?? []).map((r) => r.conversation_id);
      if (ids.length === 0) return [] as Conversation[];
      const [{ data: convs }, { data: members }] = await Promise.all([
        supabase.from("conversations").select("id, is_group, name, created_by").in("id", ids),
        supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", ids),
      ]);
      return (convs ?? []).map((c) => ({
        ...c,
        member_ids: (members ?? [])
          .filter((m) => m.conversation_id === c.id)
          .map((m) => m.user_id),
      })) as Conversation[];
    },
  });
}

export function useFriendships(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["friendships", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status");
      if (error) throw error;
      return (data ?? []) as Friendship[];
    },
  });
}

export function useVoiceStates() {
  return useQuery({
    queryKey: ["voice-states"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_states")
        .select("user_id, channel_id, conversation_id, muted, deafened, sharing_screen, camera_on");
      if (error) throw error;
      return (data ?? []) as VoiceState[];
    },
  });
}

export function useMessages(scope: {
  channelId?: string | undefined;
  conversationId?: string | undefined;
}) {
  const key = scope.channelId ?? scope.conversationId ?? null;
  return useQuery({
    enabled: !!key,
    queryKey: ["messages", key],
    queryFn: async () => {
      let query = supabase
        .from("messages")
        .select("id, channel_id, conversation_id, author_id, content, created_at")
        .order("created_at", { ascending: true })
        .limit(200);
      query = scope.channelId
        ? query.eq("channel_id", scope.channelId)
        : query.eq("conversation_id", scope.conversationId as string);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

/** Keeps every Clyro query fresh through Lovable Cloud realtime. */
export function useRealtimeSync(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("clyro-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const row = (payload.new ?? payload.old) as Message;
        const key = row?.channel_id ?? row?.conversation_id;
        if (key) void qc.invalidateQueries({ queryKey: ["messages", key] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void qc.invalidateQueries({ queryKey: ["profiles"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_states" }, () => {
        void qc.invalidateQueries({ queryKey: ["voice-states"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void qc.invalidateQueries({ queryKey: ["friendships", userId] });
        void qc.invalidateQueries({ queryKey: ["profiles"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => {
        void qc.invalidateQueries({ queryKey: ["channels"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members" }, () => {
        void qc.invalidateQueries({ queryKey: ["servers", userId] });
        void qc.invalidateQueries({ queryKey: ["server-members"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        void qc.invalidateQueries({ queryKey: ["conversations", userId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}
