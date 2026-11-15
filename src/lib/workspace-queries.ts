import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Workspaces, equipes e convites. O workspace é a tabela `servers` de antes —
 * o chat e as salas de voz continuam pendurados nela —, e as equipes e os
 * convites moram nas tabelas da migração workspace_teams_invites.
 */

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceMember = {
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
};

export type Team = {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  color: TeamColor;
  created_by: string;
  created_at: string;
  member_ids: string[];
  lead_ids: string[];
};

export type WorkspaceInvite = {
  id: string;
  server_id: string;
  team_id: string | null;
  invited_by: string;
  user_id: string | null;
  email: string | null;
  role: "admin" | "member";
  status: "pending" | "accepted" | "declined" | "revoked";
  created_at: string;
};

export type IncomingInvite = WorkspaceInvite & {
  workspace_name: string;
  workspace_icon: string | null;
};

export const TEAM_COLORS = ["blue", "orange", "green", "violet", "pink", "slate"] as const;
export type TeamColor = (typeof TEAM_COLORS)[number];

/** Cor de cada equipe: fundo suave + texto, sempre a partir de oklch. */
export const TEAM_COLOR_STYLE: Record<TeamColor, { bg: string; fg: string; dot: string }> = {
  blue: { bg: "oklch(0.94 0.04 262)", fg: "oklch(0.45 0.2 262)", dot: "oklch(0.58 0.2 262)" },
  orange: { bg: "oklch(0.95 0.05 60)", fg: "oklch(0.5 0.15 50)", dot: "oklch(0.72 0.17 55)" },
  green: { bg: "oklch(0.95 0.05 155)", fg: "oklch(0.45 0.13 155)", dot: "oklch(0.66 0.16 152)" },
  violet: { bg: "oklch(0.94 0.05 300)", fg: "oklch(0.45 0.18 300)", dot: "oklch(0.6 0.2 300)" },
  pink: { bg: "oklch(0.95 0.04 350)", fg: "oklch(0.5 0.17 355)", dot: "oklch(0.66 0.2 355)" },
  slate: { bg: "oklch(0.94 0.006 264)", fg: "oklch(0.38 0.01 264)", dot: "oklch(0.55 0.015 264)" },
};

export const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Founder",
  admin: "Admin",
  member: "Membro",
};

function normalizeRole(role: string): WorkspaceRole {
  return role === "owner" || role === "admin" ? role : "member";
}

export function useWorkspaceMembers(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["workspace-members", serverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_members")
        .select("user_id, role, created_at")
        .eq("server_id", serverId as string)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row): WorkspaceMember => ({
        user_id: row.user_id,
        role: normalizeRole(row.role),
        joined_at: row.created_at,
      }));
    },
  });
}

export function useTeams(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["teams", serverId],
    // Sem a migração aplicada a tabela não existe: o painel segue sem equipes.
    retry: 1,
    queryFn: async () => {
      const { data: teams, error } = await supabase
        .from("teams")
        .select("id, server_id, name, description, color, created_by, created_at")
        .eq("server_id", serverId as string)
        .order("created_at");
      if (error) return [] as Team[];
      const ids = (teams ?? []).map((t) => t.id);
      const { data: members } = ids.length
        ? await supabase.from("team_members").select("team_id, user_id, role").in("team_id", ids)
        : { data: [] as { team_id: string; user_id: string; role: string }[] };
      return (teams ?? []).map((team): Team => ({
        ...team,
        color: (TEAM_COLORS as readonly string[]).includes(team.color)
          ? (team.color as TeamColor)
          : "blue",
        member_ids: (members ?? []).filter((m) => m.team_id === team.id).map((m) => m.user_id),
        lead_ids: (members ?? [])
          .filter((m) => m.team_id === team.id && m.role === "lead")
          .map((m) => m.user_id),
      }));
    },
  });
}

export function useWorkspaceInvites(serverId: string | null) {
  return useQuery({
    enabled: !!serverId,
    queryKey: ["workspace-invites", serverId],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_invites")
        .select("id, server_id, team_id, invited_by, user_id, email, role, status, created_at")
        .eq("server_id", serverId as string)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) return [] as WorkspaceInvite[];
      return (data ?? []) as WorkspaceInvite[];
    },
  });
}

/** Convites esperando por você — por conta ou pelo email da conta. */
export function useIncomingInvites(userId: string | undefined, email: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["incoming-invites", userId],
    retry: 1,
    queryFn: async () => {
      const filters = [`user_id.eq.${userId}`];
      if (email) filters.push(`email.eq.${email.toLowerCase()}`);
      const { data, error } = await supabase
        .from("workspace_invites")
        .select(
          "id, server_id, team_id, invited_by, user_id, email, role, status, created_at, servers(name, icon_url)",
        )
        .eq("status", "pending")
        .or(filters.join(","))
        .order("created_at", { ascending: false });
      if (error) return [] as IncomingInvite[];
      return (data ?? []).map((row) => {
        const { servers, ...invite } = row as typeof row & {
          servers: { name: string; icon_url: string | null } | null;
        };
        return {
          ...(invite as WorkspaceInvite),
          workspace_name: servers?.name ?? "Workspace",
          workspace_icon: servers?.icon_url ?? null,
        };
      });
    },
  });
}

/** Mantém equipes e convites em dia com o tempo real. */
export function useWorkspaceRealtime(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("clyro-workspace-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => {
        void qc.invalidateQueries({ queryKey: ["teams"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, () => {
        void qc.invalidateQueries({ queryKey: ["teams"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "workspace_invites" }, () => {
        void qc.invalidateQueries({ queryKey: ["workspace-invites"] });
        void qc.invalidateQueries({ queryKey: ["incoming-invites", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members" }, () => {
        void qc.invalidateQueries({ queryKey: ["workspace-members"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

/** Mensagem legível de um erro do Postgres/PostgREST. */
export function errorMessage(error: unknown, fallback: string) {
  const message = (error as { message?: string } | null)?.message;
  if (!message) return fallback;
  // Erros nossos já vêm em português; os do banco em inglês viram o fallback.
  return /[ãçéêíóú]|Só |Nenhum|Informe|Essa |Esse |Você /.test(message) ? message : fallback;
}
