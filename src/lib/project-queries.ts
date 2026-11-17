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
  /** Foto de perfil de quem criou: o logo de quem ainda não subiu um. */
  owner_avatar?: string | null;
};

/** O logo da comunidade; sem logo, a foto de perfil de quem criou. */
export function projectLogo(project: { icon_url?: string | null; owner_avatar?: string | null }) {
  return project.icon_url || project.owner_avatar || null;
}

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
 * Categorias da vitrine. `tone` é o fundo apagado dos cartões sem capa; `chip`
 * é o pastel mais vivo da ficha do catálogo, uma cor por assunto. As nove
 * primeiras são as da faixa da home.
 */
export const CATEGORIES: {
  id: string;
  label: string;
  tone: string;
  ink: string;
  chip: string;
  pose: MascotPose;
}[] = [
  { id: "saas", label: "SaaS", tone: "#dfe7f5", ink: "#1f3b70", chip: "#d6e2ff", pose: "neutro" },
  { id: "ia", label: "IA", tone: "#e7e1fb", ink: "#3b1f8f", chip: "#e2d8ff", pose: "estrela" },
  {
    id: "fintech",
    label: "Fintech",
    tone: "#dff0e4",
    ink: "#1d5233",
    chip: "#bfeccd",
    pose: "sorte",
  },
  {
    id: "saude",
    label: "Saúde",
    tone: "#fbe3df",
    ink: "#7a2a1f",
    chip: "#ffd6d6",
    pose: "energia",
  },
  {
    id: "educacao",
    label: "Educação",
    tone: "#fdf0d5",
    ink: "#6b4a0c",
    chip: "#ffe7a6",
    pose: "chuva",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    tone: "#f6e2d3",
    ink: "#6e3b17",
    chip: "#ffd8bf",
    pose: "brincando",
  },
  {
    id: "games",
    label: "Games",
    tone: "#e2e4ea",
    ink: "#25283a",
    chip: "#cdd0f7",
    pose: "brincando",
  },
  {
    id: "impacto",
    label: "Impacto",
    tone: "#e4efd8",
    ink: "#3c5418",
    chip: "#d3edb2",
    pose: "chuva",
  },
  {
    id: "comunidade",
    label: "Comunidade",
    tone: "#f4dfe9",
    ink: "#6c1f45",
    chip: "#ffd3ea",
    pose: "sorte",
  },
  { id: "agro", label: "Agro", tone: "#e8edd5", ink: "#44511a", chip: "#e2eba8", pose: "sorte" },
  {
    id: "logistica",
    label: "Logística",
    tone: "#e3e9ee",
    ink: "#23394a",
    chip: "#cfe3f3",
    pose: "energia",
  },
  {
    id: "mobilidade",
    label: "Mobilidade",
    tone: "#e0ecef",
    ink: "#134a55",
    chip: "#bfe8ef",
    pose: "energia",
  },
  {
    id: "clima",
    label: "Clima e energia",
    tone: "#ddefe9",
    ink: "#13503f",
    chip: "#b6ead8",
    pose: "chuva",
  },
  {
    id: "varejo",
    label: "Varejo",
    tone: "#f7e4dc",
    ink: "#6d2e17",
    chip: "#ffcfc0",
    pose: "brincando",
  },
  {
    id: "rh",
    label: "RH e trabalho",
    tone: "#efe3f3",
    ink: "#57206b",
    chip: "#f0d4fb",
    pose: "neutro",
  },
  {
    id: "seguranca",
    label: "Segurança",
    tone: "#e2e3ec",
    ink: "#262a4d",
    chip: "#d6daf6",
    pose: "estrela",
  },
  {
    id: "imoveis",
    label: "Imóveis",
    tone: "#f3ead9",
    ink: "#5b4312",
    chip: "#f6e0b6",
    pose: "neutro",
  },
  {
    id: "juridico",
    label: "Jurídico",
    tone: "#e8e6ee",
    ink: "#2f2f45",
    chip: "#e0dcf2",
    pose: "estrela",
  },
];

/** As áreas da faixa da home: cabem numa linha em telas largas. */
export const FEATURED_CATEGORIES = CATEGORIES.slice(0, 9);

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
        ...(search ? { _search: search } : {}),
        ...(category ? { _category: category } : {}),
        _limit: 120,
      });
      if (error) return [] as ProjectCard[];
      return (data ?? []).map((p) => ({
        ...p,
        looking_for: p.looking_for ?? [],
        request_status: (p.request_status as RequestStatus | null) ?? null,
        // Vem da função da vitrine depois da migração 20261117000000; antes, fica vazio.
        owner_avatar: (p as { owner_avatar?: string | null }).owner_avatar ?? null,
      }));
    },
  });
}

/**
 * O projeto que a pessoa já publicou (é dona), o mais recente. Quem já tem um
 * entra no workspace dele em vez de publicar outro.
 */
export function useOwnedProject(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["owned-project", userId],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servers")
        .select("id, name")
        .eq("owner_id", userId as string)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) return null;
      return data?.[0] ?? null;
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

/** Projeto como aparece no perfil de alguém: o que fundou e onde participa. */
export type ProfileProject = {
  id: string;
  name: string;
  tagline: string | null;
  cover_url: string | null;
  category: string | null;
  stage: string | null;
  owner_id: string;
  founded: boolean;
};

const PROFILE_PROJECT_COLUMNS = "id, name, tagline, cover_url, category, stage, owner_id";
// Sem a migração de projetos o banco só tem as colunas do workspace antigo.
const BASE_PROJECT_COLUMNS = "id, name, owner_id";
type ProfileProjectRow = Omit<ProfileProject, "founded">;

async function fetchProfileProjects(userId: string, columns: string) {
  const [member, owned] = await Promise.all([
    supabase.from("server_members").select(`servers(${columns})`).eq("user_id", userId),
    supabase.from("servers").select(columns).eq("owner_id", userId),
  ]);
  const error = member.error ?? owned.error;
  const rows = new Map<string, ProfileProjectRow>();
  const add = (s: Partial<ProfileProjectRow> | null) => {
    if (!s?.id) return;
    rows.set(s.id, {
      id: s.id,
      name: s.name ?? "",
      owner_id: s.owner_id ?? "",
      tagline: s.tagline ?? null,
      cover_url: s.cover_url ?? null,
      category: s.category ?? null,
      stage: s.stage ?? null,
    });
  };
  (member.data ?? []).forEach((r) =>
    add((r as unknown as { servers: Partial<ProfileProjectRow> | null }).servers),
  );
  ((owned.data ?? []) as unknown as Partial<ProfileProjectRow>[]).forEach(add);
  return { error, rows: [...rows.values()] };
}

/**
 * Projetos de uma pessoa: os workspaces dela que quem vê também enxerga (o RLS
 * decide) mais os que ela fundou e estão públicos. Fundados primeiro.
 */
export function useProfileProjects(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["profile-projects", userId],
    retry: 1,
    queryFn: async () => {
      let result = await fetchProfileProjects(userId as string, PROFILE_PROJECT_COLUMNS);
      if (result.error?.code === "42703") {
        result = await fetchProfileProjects(userId as string, BASE_PROJECT_COLUMNS);
      }
      return result.rows
        .map((s) => ({ ...s, founded: s.owner_id === userId }))
        .sort((a, b) => Number(b.founded) - Number(a.founded) || a.name.localeCompare(b.name));
    },
  });
}
