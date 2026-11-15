import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { MascotPose } from "@/components/workspace/mascot";

/**
 * Projetos publicados na vitrine. Um projeto é o workspace de antes (`servers`)
 * com capa, categoria, o que procura e um formulário de entrada.
 */

export type AccessQuestion = { id: string; label: string; required: boolean };

export type ProjectCard = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  icon_url: string | null;
  cover_url: string | null;
  category: string | null;
  stage: string | null;
  looking_for: string[];
  member_count: number;
  is_member: boolean;
  request_status: RequestStatus | null;
  created_at: string;
};

export type ProjectDetail = ProjectCard & {
  website: string | null;
  access_questions: AccessQuestion[];
  is_public: boolean;
  owner_id: string;
  owner_name: string | null;
  owner_avatar: string | null;
};

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type AccessRequest = {
  id: string;
  server_id: string;
  user_id: string;
  answers: Record<string, string>;
  message: string | null;
  status: RequestStatus;
  created_at: string;
};

/**
 * Categorias da vitrine. Cada uma tem a sua cor — é o que dá variedade à página,
 * no lugar das fotos de produto da referência — e uma pose do mascote.
 */
export const CATEGORIES: {
  id: string;
  label: string;
  tone: string;
  ink: string;
  pose: MascotPose;
}[] = [
  { id: "saas", label: "SaaS", tone: "#dfe7f5", ink: "#1f3b70", pose: "neutro" },
  { id: "ia", label: "IA", tone: "#e7e1fb", ink: "#3b1f8f", pose: "estrela" },
  { id: "fintech", label: "Fintech", tone: "#dff0e4", ink: "#1d5233", pose: "sorte" },
  { id: "saude", label: "Saúde", tone: "#fbe3df", ink: "#7a2a1f", pose: "energia" },
  { id: "educacao", label: "Educação", tone: "#fdf0d5", ink: "#6b4a0c", pose: "chuva" },
  { id: "marketplace", label: "Marketplace", tone: "#f6e2d3", ink: "#6e3b17", pose: "brincando" },
  { id: "games", label: "Games", tone: "#e2e4ea", ink: "#25283a", pose: "brincando" },
  { id: "impacto", label: "Impacto", tone: "#e4efd8", ink: "#3c5418", pose: "chuva" },
  { id: "comunidade", label: "Comunidade", tone: "#f4dfe9", ink: "#6c1f45", pose: "sorte" },
];

export function categoryOf(id: string | null | undefined) {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

/** Quem os projetos podem estar procurando. */
export const ROLES = [
  "Cofounder",
  "Dev",
  "Design",
  "Produto",
  "Marketing",
  "Vendas",
  "Dados",
  "Investidor",
  "Mentor",
  "Beta testers",
  "Comunidade",
];

export const STAGES = ["Ideia", "MVP", "Beta", "Tração", "Escala"];

function toQuestions(value: Json | null | undefined): AccessQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((q) => q as { id?: unknown; label?: unknown; required?: unknown })
    .filter((q) => typeof q.id === "string" && typeof q.label === "string")
    .map((q) => ({ id: q.id as string, label: q.label as string, required: q.required === true }));
}

export function useDiscoverProjects(search: string, category: string | null) {
  return useQuery({
    queryKey: ["discover-projects", search, category],
    // Sem a migração de projetos a função não existe: a vitrine fica vazia.
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("discover_projects", {
        _search: search || null,
        _category: category,
        _limit: 120,
      });
      if (error) return [] as ProjectCard[];
      return (data ?? []).map((p) => ({
        ...p,
        looking_for: p.looking_for ?? [],
        request_status: (p.request_status as RequestStatus | null) ?? null,
      }));
    },
  });
}

export function useProject(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ["project", id],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project", { _id: id as string });
      if (error) throw error;
      const row = data?.[0];
      if (!row) return null;
      return {
        ...row,
        looking_for: row.looking_for ?? [],
        access_questions: toQuestions(row.access_questions),
        request_status: (row.request_status as RequestStatus | null) ?? null,
      } satisfies ProjectDetail;
    },
  });
}

/** Pedidos pendentes de um projeto — para quem administra. */
export function useProjectRequests(serverId: string | null, enabled: boolean) {
  return useQuery({
    enabled: !!serverId && enabled,
    queryKey: ["project-requests", serverId],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .select("id, server_id, user_id, answers, message, status, created_at")
        .eq("server_id", serverId as string)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) return [] as AccessRequest[];
      return (data ?? []).map((r) => ({
        ...r,
        answers: (r.answers ?? {}) as Record<string, string>,
        status: r.status as RequestStatus,
      }));
    },
  });
}

export function projectQuestions(value: Json | null | undefined) {
  return toQuestions(value);
}
