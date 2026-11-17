import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CloseCircle, SearchNormal1, Setting4 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORIES,
  ROLES,
  STAGES,
  categoryOf,
  projectLogo,
  useDiscoverProjects,
  useOwnedProject,
  type ProjectCard,
} from "@/lib/project-queries";
import { catalogHref, mergeCatalogSearch, type CatalogSearch } from "@/lib/catalog-search";
import { saveWorkspace } from "@/lib/workspace-memory";
import { ClyroMark, MediaImage, UserAvatar } from "@/components/clyro/primitives";
import { Mascot } from "@/components/workspace/mascot";
import { Reveal, useMotionReady } from "@/hooks/use-reveal";
import { buttonPrimary } from "./site-nav";
import { ProjectArt } from "./project-tile";

/**
 * Catálogo completo, em mural: busca grande no topo, áreas como fichas com
 * miniatura e os projetos em colunas de alturas diferentes. Só com conta.
 */
export function CatalogPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/buscar" });
  const { q = "", categoria, fase, funcao } = search;

  // Sem conta, o catálogo não abre: vai para o login e volta com a mesma busca.
  useEffect(() => {
    if (!loading && !user) {
      void navigate({ to: "/auth", search: { next: catalogHref(search) }, replace: true });
    }
  }, [loading, user, navigate, search]);

  useMotionReady();

  const set = (patch: { [K in keyof CatalogSearch]?: string | undefined }) =>
    void navigate({
      to: "/buscar",
      search: (prev: CatalogSearch) => mergeCatalogSearch(prev, patch),
    });

  const { data: all = [] } = useDiscoverProjects("", null);
  const { data: found = [], isLoading } = useDiscoverProjects(q, categoria ?? null);
  const projects = useMemo(
    () =>
      found.filter(
        (p) => (!fase || p.stage === fase) && (!funcao || p.looking_for.includes(funcao)),
      ),
    [found, fase, funcao],
  );

  /*
   * Fichas de assunto: só as áreas com uma startup que tenha capa ou logo, com
   * essa imagem em destaque. Área sem imagem não aparece. As mais cheias primeiro.
   */
  const topics = useMemo(() => {
    // Capa vence logo: guarda a primeira de cada, por área.
    const byCat = new Map<string, { cover: string | null; logo: string | null; count: number }>();
    all.forEach((p) => {
      if (!p.category) return;
      const t = byCat.get(p.category) ?? { cover: null, logo: null, count: 0 };
      t.count += 1;
      t.cover ??= p.cover_url;
      t.logo ??= p.icon_url;
      byCat.set(p.category, t);
    });
    return CATEGORIES.flatMap((c) => {
      const t = byCat.get(c.id);
      const image = t?.cover ?? t?.logo;
      return t && image ? [{ ...c, image, count: t.count }] : [];
    }).sort((x, y) => y.count - x.count);
  }, [all]);

  const [filtersOpen, setFiltersOpen] = useState(Boolean(fase || funcao));
  const filterCount = Number(Boolean(fase)) + Number(Boolean(funcao));
  const narrowed = Boolean(q || categoria || fase || funcao);
  const cat = categoryOf(categoria);

  if (loading || !user) {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <CatalogBar
        key={q}
        initial={q}
        profile={profile}
        onSubmit={(value) => set({ q: value.trim() || undefined })}
      />

      {/* Áreas como fichas com miniatura; a primeira é o filtro de fase e função. */}
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <div className="clyro-scroll -mx-4 flex gap-2.5 overflow-x-auto px-4 py-1.5 sm:-mx-6 sm:px-6">
          <button
            type="button"
            aria-label="Filtros de fase e função"
            aria-expanded={filtersOpen}
            aria-controls="filtros-catalogo"
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-[background-color,color,transform] duration-200 ease-clyro active:scale-[0.96]",
              filtersOpen
                ? "bg-foreground text-background"
                : "bg-surface-2 text-foreground hover:bg-edge",
            )}
          >
            <Setting4 size={22} color="currentColor" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white ring-2 ring-background">
                {filterCount}
              </span>
            )}
          </button>
          {topics.map((t) => {
            const active = categoria === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => set({ categoria: active ? undefined : t.id })}
                className={cn(
                  "group flex h-14 shrink-0 items-stretch overflow-hidden rounded-2xl transition-[box-shadow,transform,filter] duration-200 ease-clyro hover:brightness-[0.97] active:scale-[0.97]",
                  active && "shadow-[0_0_0_2px_var(--background),0_0_0_4px_var(--foreground)]",
                )}
                style={{ background: t.chip }}
              >
                <span className="w-16 shrink-0 overflow-hidden bg-surface-2">
                  <MediaImage
                    src={t.image}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 ease-clyro group-hover:scale-105"
                  />
                </span>
                <span className="flex items-center whitespace-nowrap px-4 text-[16px] font-medium tracking-[-0.01em] text-foreground">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>

        {filtersOpen && (
          <div
            id="filtros-catalogo"
            className="hero-in mt-3 grid gap-4 rounded-2xl bg-surface-1 p-4 shadow-[0_0_0_1px_var(--edge)] sm:p-5"
          >
            <FilterRow
              label="Fase"
              options={STAGES}
              value={fase}
              onChange={(v) => set({ fase: v })}
            />
            <FilterRow
              label="Procura"
              options={ROLES}
              value={funcao}
              onChange={(v) => set({ funcao: v })}
            />
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">
            {q ? <>“{q}”</> : (cat?.label ?? "Todos os projetos")}
            {q && cat && <span className="text-muted-foreground"> em {cat.label}</span>}
          </h1>
          <div className="flex items-center gap-4 text-[14px] text-muted-foreground">
            {!isLoading && (
              <span>
                {projects.length} {projects.length === 1 ? "projeto" : "projetos"}
              </span>
            )}
            {narrowed && (
              <Link
                to="/buscar"
                search={{}}
                className="font-medium text-foreground underline decoration-edge-strong underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Limpar tudo
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6">
        {isLoading ? (
          <MasonrySkeleton />
        ) : projects.length > 0 ? (
          <div className="columns-2 gap-4 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7">
            {projects.map((p, i) => (
              <Reveal key={p.id} i={i % 6} className="mb-6 break-inside-avoid">
                <CatalogCard project={p} />
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyCatalog narrowed={narrowed} total={all.length} />
        )}
      </main>
    </div>
  );
}

/** Barra do topo: marca, busca em pílula cinza larga e o avatar. */
function CatalogBar({
  initial,
  profile,
  onSubmit,
}: {
  initial: string;
  profile: ReturnType<typeof useAuth>["profile"];
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-background/90 backdrop-blur-xl transition-shadow duration-300 ease-clyro",
        scrolled && "shadow-[0_1px_0_var(--edge),0_8px_24px_-20px_rgb(0_0_0/0.3)]",
      )}
    >
      <div className="mx-auto flex h-[76px] max-w-[1600px] items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Link
          to="/"
          aria-label="Clyro, início"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-[background-color,transform] duration-200 ease-clyro hover:bg-surface-2 active:scale-95"
        >
          <ClyroMark className="h-9 w-9" />
        </Link>
        <Link
          to="/"
          className="hidden h-11 items-center rounded-xl px-4 text-[15px] font-semibold tracking-[-0.01em] transition-colors hover:bg-surface-2 md:flex"
        >
          Início
        </Link>

        <form
          role="search"
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            input.current?.blur();
            onSubmit(value);
          }}
        >
          <label htmlFor="busca-catalogo" className="sr-only">
            Buscar projetos
          </label>
          <div className="group/search flex h-12 items-center rounded-2xl bg-surface-2 pl-4 pr-1.5 [view-transition-name:busca] transition-[background-color,box-shadow] duration-200 ease-clyro hover:bg-edge focus-within:bg-background focus-within:shadow-[0_0_0_2px_var(--brand),0_0_0_6px_var(--brand-soft)] focus-within:hover:bg-background">
            <SearchNormal1
              size={20}
              color="currentColor"
              className="shrink-0 text-muted-foreground transition-colors group-focus-within/search:text-foreground"
            />
            <input
              ref={input}
              id="busca-catalogo"
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Buscar por nome, área ou função"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[16px] tracking-[-0.01em] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {value && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => {
                  setValue("");
                  onSubmit("");
                  input.current?.focus();
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <CloseCircle size={18} color="currentColor" />
              </button>
            )}
          </div>
        </form>

        <PublishOrWorkspace
          className={buttonPrimary("hidden h-11 rounded-xl px-4 lg:inline-flex")}
        />
        {profile && (
          <Link
            to="/app"
            aria-label="Seu perfil"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-200 ease-clyro hover:bg-surface-2 active:scale-95"
          >
            <UserAvatar profile={profile} size={34} showStatus={false} />
          </Link>
        )}
      </div>
    </header>
  );
}

const chip = (active: boolean) =>
  cn(
    "flex h-14 shrink-0 items-center gap-2 rounded-2xl px-4 text-[15px] font-semibold tracking-[-0.01em] transition-[background-color,color,transform] duration-200 ease-clyro active:scale-[0.97]",
    active ? "bg-foreground text-background" : "bg-surface-2 text-foreground hover:bg-edge",
  );

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-20 shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? undefined : o)}
              className={cn(
                "h-9 rounded-full px-3.5 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-200 ease-clyro",
                active
                  ? "bg-foreground text-background"
                  : "bg-background text-foreground shadow-[0_0_0_1px_var(--edge-strong)] hover:shadow-[0_0_0_1px_#a8a8a8]",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Alturas que variam pelo id: o mural fica irregular e igual a cada visita. */
const RATIOS = ["3 / 4", "1 / 1", "4 / 5", "2 / 3", "4 / 5", "3 / 4"];
const ratioOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return RATIOS[Math.abs(h) % RATIOS.length];
};

/** Cartão do mural: a arte grande e arredondada, o nome e o que procura embaixo. */
function CatalogCard({ project }: { project: ProjectCard }) {
  const cat = categoryOf(project.category);
  const looking = project.looking_for.slice(0, 3);
  // Sem logo da comunidade, vale a foto de perfil de quem criou.
  const logo = projectLogo(project);
  return (
    <Link
      to="/p/$projectId"
      params={{ projectId: project.id }}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4"
    >
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ aspectRatio: ratioOf(project.id), background: cat?.tone }}
      >
        {project.cover_url ? (
          <ProjectArt
            project={project}
            className="transition-transform duration-500 ease-clyro group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 pb-11 pt-4 text-center sm:gap-3 sm:px-5">
            {logo ? (
              <MediaImage
                src={logo}
                alt=""
                className="h-[60px] w-[60px] shrink-0 rounded-full object-cover shadow-[0_0_0_3px_rgb(255_255_255/0.7)] transition-transform duration-500 ease-clyro group-hover:scale-105"
              />
            ) : (
              <Mascot
                pose={cat?.pose ?? "neutro"}
                size={60}
                className="shrink-0 transition-transform duration-500 ease-clyro group-hover:-rotate-6 group-hover:scale-105"
              />
            )}
            <span
              className="line-clamp-3 text-[15px] font-semibold leading-tight tracking-[-0.02em] sm:text-[17px]"
              style={{ color: cat?.ink }}
            >
              {project.tagline ?? project.name}
            </span>
          </div>
        )}

        {/* No hover, a arte escurece um pouco e a ação aparece no canto. */}
        <div className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/25" />
        <span className="absolute right-3 top-3 flex h-10 translate-y-1 items-center rounded-xl bg-brand px-4 text-[14px] font-semibold text-white opacity-0 transition-[opacity,transform] duration-200 ease-clyro group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          {project.is_member ? "Abrir" : "Ver projeto"}
        </span>
        {project.stage && (
          <span className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2 py-1 text-[12px] font-semibold text-foreground backdrop-blur">
            {project.stage}
          </span>
        )}
      </div>

      <div className="flex items-start gap-2.5 px-1 pt-2.5">
        {logo && (
          <MediaImage
            src={logo}
            alt=""
            className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em]">{project.name}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {looking.length
              ? `Procura ${looking.join(", ")}`
              : `${cat?.label ?? "Projeto"} · ${project.member_count} ${project.member_count === 1 ? "pessoa" : "pessoas"}`}
          </p>
          <JoinStatus project={project} />
        </div>
      </div>
    </Link>
  );
}

/**
 * A situação de cada startup para quem está olhando, sempre à vista: dá para
 * pedir para entrar, o pedido já foi, ou você já faz parte. O pedido em si é
 * feito na página do projeto, com o formulário de quem é dono.
 */
function JoinStatus({ project }: { project: ProjectCard }) {
  if (project.is_member) {
    return (
      <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-[#ecfdf3] px-2.5 text-[12.5px] font-medium text-[#15803d]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
        Você participa
      </span>
    );
  }
  if (project.request_status === "pending") {
    return (
      <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-[#fff7ed] px-2.5 text-[12.5px] font-medium text-[#c2410c]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
        Pedido enviado
      </span>
    );
  }
  return (
    <span className="mt-2 inline-flex h-7 items-center rounded-full border border-brand/40 px-2.5 text-[12.5px] font-medium text-[#c2410c] transition-colors duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-white">
      Pedir para entrar
    </span>
  );
}

const SKELETON = [260, 340, 300, 220, 380, 280, 320, 240, 360, 300, 260, 340];

function MasonrySkeleton() {
  return (
    <div
      aria-label="Carregando projetos"
      className="columns-2 gap-4 sm:columns-3 md:columns-4 lg:columns-5 xl:columns-6 2xl:columns-7"
    >
      {SKELETON.map((h, i) => (
        <div key={i} className="mb-6 break-inside-avoid">
          <div className="animate-pulse rounded-2xl bg-surface-2" style={{ height: h }} />
          <div className="mt-3 h-3.5 w-2/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

function EmptyCatalog({ narrowed, total }: { narrowed: boolean; total: number }) {
  const { user } = useAuth();
  const { data: owned } = useOwnedProject(user?.id);
  const invite = owned
    ? "Ainda não há projetos abertos no catálogo."
    : "Ainda não há projetos publicados. Publique o seu e seja o primeiro do catálogo.";
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center py-20 text-center">
      <Mascot pose={narrowed ? "chuva" : "estrela"} size={88} />
      <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.03em]">
        {narrowed ? "Nenhum projeto com esses filtros" : "Nenhum projeto aberto ainda"}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {narrowed
          ? total > 0
            ? "Tente outra palavra ou tire um filtro para ver mais projetos."
            : invite
          : owned
            ? "Os projetos publicados aparecem aqui."
            : "Publique o seu e seja o primeiro do catálogo."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {narrowed && (
          <Link
            to="/buscar"
            search={{}}
            className="inline-flex h-10 items-center rounded-md bg-surface-2 px-4 text-[14px] font-medium transition-colors hover:bg-edge"
          >
            Limpar filtros
          </Link>
        )}
        <PublishOrWorkspace className={buttonPrimary("h-10")} />
      </div>
    </div>
  );
}

/** Quem já tem projeto entra no workspace dele; quem não tem, publica. */
function PublishOrWorkspace({ className }: { className: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: owned } = useOwnedProject(user?.id);
  if (owned) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          saveWorkspace(owned.id);
          void navigate({ to: "/app" });
        }}
      >
        Abrir workspace
      </button>
    );
  }
  return (
    <Link to="/" search={{ publicar: true }} className={className}>
      Publicar projeto
    </Link>
  );
}
