import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Channel,
  ChannelCategory,
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
        // Ver a nota em useAuth: select("*") tolera a migração de personalização
        // ainda não aplicada.
        .select("*");
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
      // `category_id` só existe depois da migração channel_categories. Pedir a
      // coluna antes disso derruba a consulta inteira e a barra lateral fica
      // sem canal nenhum — por isso a tentativa com fallback.
      const base = "id, server_id, name, kind, position";
      const withCategory = await supabase
        .from("channels")
        .select(`${base}, category_id`)
        .eq("server_id", serverId as string)
        .order("position");

      if (!withCategory.error) {
        return (withCategory.data ?? []) as unknown as Channel[];
      }

      const { data, error } = await supabase
        .from("channels")
        .select(base)
        .eq("server_id", serverId as string)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, category_id: null })) as unknown as Channel[];
    },
  });
}

/**
 * Categorias do servidor. A tabela pode não existir ainda (migração
 * channel_categories pendente), então o erro é engolido e a barra lateral
 * simplesmente cai nos grupos padrão em vez de travar.
 */
export function useChannelCategories(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["channel-categories", serverId],
    retry: 1,
    queryFn: async () => {
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (
              column: string,
              value: string,
            ) => {
              order: (
                column: string,
              ) => Promise<{ data: ChannelCategory[] | null; error: unknown }>;
            };
          };
        };
      };
      const { data, error } = await client
        .from("channel_categories")
        .select("id, server_id, name, position")
        .eq("server_id", serverId as string)
        .order("position");
      if (error) return [] as ChannelCategory[];
      return data ?? [];
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
        supabase
          .from("conversation_members")
          .select("conversation_id, user_id")
          .in("conversation_id", ids),
      ]);
      return (convs ?? []).map((c) => ({
        ...c,
        member_ids: (members ?? []).filter((m) => m.conversation_id === c.id).map((m) => m.user_id),
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
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void qc.invalidateQueries({ queryKey: ["friendships", userId] });
        void qc.invalidateQueries({ queryKey: ["profiles"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => {
        void qc.invalidateQueries({ queryKey: ["channels"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_categories" }, () => {
        void qc.invalidateQueries({ queryKey: ["channel-categories"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members" }, () => {
        void qc.invalidateQueries({ queryKey: ["servers", userId] });
        void qc.invalidateQueries({ queryKey: ["server-members"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members" },
        () => {
          void qc.invalidateQueries({ queryKey: ["conversations", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

export type DiscoverServer = {
  id: string;
  name: string;
  icon_url: string | null;
  description: string | null;
  member_count: number;
  is_member: boolean;
  created_at: string | null;
};

export type DiscoverSort = "popular" | "new";

/**
 * Lista as comunidades públicas para a vitrine. Depende da função
 * `discover_servers` (migração 20260823120000) — os tipos gerados ainda não a
 * conhecem, por isso o cast na chamada.
 */
export function useDiscoverServers(search: string, sort: DiscoverSort = "popular") {
  return useQuery({
    queryKey: ["discover-servers", search, sort],
    // Função ausente devolve 404: insistir não resolve e só deixa o painel travado.
    retry: 1,
    queryFn: async () => {
      // O cast é no client inteiro, não no método: destacar `rpc` da instância
      // perde o `this` e a chamada quebra dentro do supabase-js.
      const client = supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: DiscoverServer[] | null; error: { message: string } | null }>;
      };
      const { data, error } = await client.rpc("discover_servers", {
        _search: search,
        _limit: 48,
        _sort: sort,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map((server) => ({
        ...server,
        member_count: Number(server.member_count),
      }));
    },
  });
}

/**
 * Servidores que você e a outra pessoa têm em comum. A política de
 * server_members já limita a leitura aos servidores dos quais você participa,
 * então basta filtrar pelo outro usuário.
 */
export function useMutualServers(otherUserId: string | undefined) {
  return useQuery({
    enabled: !!otherUserId,
    queryKey: ["mutual-servers", otherUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_members")
        .select("servers(id, name, icon_url, owner_id, invite_code)")
        .eq("user_id", otherUserId as string);
      if (error) throw error;
      return (data ?? [])
        .map((row) => (row as { servers: Server | null }).servers)
        .filter((s): s is Server => !!s)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
