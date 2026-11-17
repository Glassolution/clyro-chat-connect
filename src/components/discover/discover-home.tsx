import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight2 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORIES,
  FEATURED_CATEGORIES,
  categoryOf,
  useDiscoverProjects,
  useOwnedProject,
  type ProjectCard,
} from "@/lib/project-queries";
import { Mascot } from "@/components/workspace/mascot";
import { PromoBanner, SiteNav, buttonGhost, buttonPrimary } from "./site-nav";
import { ProjectArt, ProjectTile } from "./project-tile";
import { ProjectDialog } from "./project-dialog";
import { Closing, NotebookFooter, SectionHead, TwoSides, Workspace } from "./notebook";
import { HeroSearch } from "./hero-search";
import { catalogHref, type CatalogSearch } from "@/lib/catalog-search";
import { saveWorkspace } from "@/lib/workspace-memory";
import { Reveal, useMotionReady } from "@/hooks/use-reveal";

/**
 * A home do Clyro em planta baixa: fundo branco com grade fina, tipografia
 * preta apertada, rótulos em mono e um só laranja — o dos mascotes.
 */
export function DiscoverHome() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLElement>(null);

  const { data: all = [], isLoading } = useDiscoverProjects("", null);

  const byCategory = useMemo(() => {
    const map = new Map<string, ProjectCard[]>();
    all.forEach((p) => {
      if (!p.category) return;
      map.set(p.category, [...(map.get(p.category) ?? []), p]);
    });
    return CATEGORIES.filter((c) => (map.get(c.id)?.length ?? 0) > 0).map((c) => ({
      ...c,
      projects: map.get(c.id) ?? [],
    }));
  }, [all]);

  // Quem clica em "Publicar" sem conta volta para cá depois do login, com o
  // formulário já aberto: a intenção não se perde no caminho.
  const { publicar } = useSearch({ from: "/" });
  // Quem já publicou um projeto entra no workspace dele em vez de criar outro.
  const { data: owned } = useOwnedProject(user?.id);
  const openWorkspace = (id: string) => {
    saveWorkspace(id);
    void navigate({ to: "/app" });
  };
  const publishLabel = owned ? "Abrir workspace" : "Publicar projeto";
  const publish = () => {
    if (owned) {
      openWorkspace(owned.id);
      return;
    }
    if (!user) {
      void navigate({ to: "/auth", search: { next: "/?publicar=1" } });
      return;
    }
    setPublishOpen(true);
  };
  useEffect(() => {
    if (!publicar || !user) return;
    if (!owned) setPublishOpen(true);
    void navigate({ to: "/", search: {}, replace: true });
  }, [publicar, user, owned, navigate]);

  // A busca e as áreas abrem o catálogo, que pede conta: sem login, passa
  // pela entrada e volta com a mesma busca.
  const openCatalog = (search: CatalogSearch, { morph = false } = {}) => {
    if (!user) {
      void navigate({ to: "/auth", search: { next: catalogHref(search) } });
      return;
    }
    // A busca do hero viaja até o topo e vira a barra do catálogo.
    void navigate({
      to: "/buscar",
      search,
      viewTransition: morph ? { types: ["catalogo"] } : false,
    });
  };

  const join = () => {
    void navigate(user ? { to: "/app" } : { to: "/auth" });
  };

  useMotionReady();

  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-paper text-foreground">
      <PromoBanner onClick={publish} workspaceName={owned?.name} />
      <SiteNav
        signedIn={Boolean(user)}
        profile={profile}
        onPublish={publish}
        publishLabel={publishLabel}
        items={[
          {
            label: "Descobrir",
            active: true,
            onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
          },
          {
            label: "Categorias",
            onClick: () => scrollTo(categoriesRef.current),
          },
          { label: "Minhas comunidades", to: "/app" },
        ]}
      />

      <Hero
        total={all.length}
        draft={draft}
        onDraft={setDraft}
        onSearch={() => openCatalog(draft.trim() ? { q: draft.trim() } : {}, { morph: true })}
        category={null}
        onPublish={publish}
        publishLabel={publishLabel}
        onExplore={() => scrollTo(tracksRef.current ?? categoriesRef.current)}
        onCategory={(id) => openCatalog({ categoria: id })}
      />

      <main ref={categoriesRef} className="scroll-mt-20">
        {!isLoading && all.length > 0 ? (
          <div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 py-24 sm:px-6 lg:gap-32 lg:py-32">
            {byCategory.length > 0 && <CategoryBands bands={byCategory} />}
          </div>
        ) : null}

        <TwoSides
          innerRef={tracksRef}
          empty={all.length === 0}
          onPublish={publish}
          publishLabel={owned ? publishLabel : undefined}
          onJoin={join}
          signedIn={Boolean(user)}
        />
        <Workspace />
      </main>

      <Closing onPublish={publish} publishLabel={publishLabel} onJoin={join} />
      <NotebookFooter
        onPublish={publish}
        publishLabel={publishLabel}
        onCategory={(id) => openCatalog({ categoria: id })}
      />

      {user && (
        <ProjectDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          userId={user.id}
          onSaved={(id) => void navigate({ to: "/p/$projectId", params: { projectId: id } })}
        />
      )}
    </div>
  );
}

/*
 * Escadinhas de quadrados nos cantos, como numa planta baixa. Cada número é
 * quantas células a linha tem, da borda para dentro.
 */
const STAIRS = [6, 5, 3, 3, 1];
const CELL = 48;
/* Primeira linha da grade a partir da borda: o centro menos meia tela arredondada para cima. */
const STAIR_EDGE = `calc(50% - round(up, 50%, ${CELL}px))`;
const STAIR_X = {
  left: { left: STAIR_EDGE },
  right: { right: STAIR_EDGE },
} satisfies Record<string, React.CSSProperties>;
/* As de baixo terminam ~2 células acima do fim do hero, encaixadas na grade. */
const STAIR_BOTTOM_TOP = `round(down, calc(100% - ${STAIRS.length * CELL + 2 * CELL}px), ${CELL}px)`;

function Staircase({
  className,
  flip,
  style,
}: {
  className?: string;
  flip?: "x" | "y" | "xy";
  style?: React.CSSProperties;
}) {
  const w = Math.max(...STAIRS) * CELL + 1;
  const h = STAIRS.length * CELL + 1;
  const scale =
    flip === "x"
      ? "scale(-1,1)"
      : flip === "y"
        ? "scale(1,-1)"
        : flip === "xy"
          ? "scale(-1,-1)"
          : "";
  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("hero-in pointer-events-none absolute", className)}
      style={{ ...style, transform: scale || undefined, "--d": "900ms" } as React.CSSProperties}
    >
      {STAIRS.flatMap((n, row) =>
        Array.from({ length: n }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={col * CELL + 0.5}
            y={row * CELL + 0.5}
            width={CELL}
            height={CELL}
            fill={
              (row === 1 && col === 3) || (row === 3 && col === 0) ? "var(--brand-soft)" : "none"
            }
            stroke="var(--edge-strong)"
            strokeOpacity={1 - (row + col) * 0.09}
          />
        )),
      )}
    </svg>
  );
}

function Hero({
  total,
  draft,
  onDraft,
  onSearch,
  category,
  onCategory,
  onPublish,
  publishLabel,
  onExplore,
}: {
  publishLabel: string;
  total: number;
  draft: string;
  onDraft: (value: string) => void;
  onSearch: () => void;
  category: string | null;
  onCategory: (id: string) => void;
  onPublish: () => void;
  onExplore: () => void;
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="blueprint-grid pointer-events-none absolute inset-0" />
      {/*
       * A grade nasce no centro da tela; as escadinhas também, para cair sempre
       * em cima das linhas, em qualquer largura.
       */}
      <Staircase className="top-0 hidden sm:block" style={STAIR_X.left} />
      <Staircase className="top-0 hidden sm:block" style={STAIR_X.right} flip="x" />
      <Staircase
        className="hidden opacity-70 lg:block"
        style={{ ...STAIR_X.left, top: STAIR_BOTTOM_TOP }}
        flip="y"
      />
      <Staircase
        className="hidden opacity-70 lg:block"
        style={{ ...STAIR_X.right, top: STAIR_BOTTOM_TOP }}
        flip="xy"
      />

      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-24">
        {/* Números reais da vitrine; o mascote de frente marca cada um, sem cara de nota. */}
        <div className="hero-in flex flex-wrap items-center justify-center gap-x-10 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Mascot pose="neutro" size={16} />
            {total} {total === 1 ? "projeto aberto" : "projetos abertos"}
          </span>
          <span className="flex items-center gap-2">
            <Mascot pose="neutro" size={16} />
            {CATEGORIES.length} categorias
          </span>
        </div>

        <h1 className="mt-8 text-[clamp(2.2rem,8vw,5.25rem)] font-semibold leading-[1.2] tracking-[-0.045em]">
          {/*
           * Entrada do hero, o momento autoral da página: as linhas sobem, a
           * tecla cai e é pressionada, e "sozinho" é digitado em pixel.
           */}
          <span className="hero-in inline-block" style={{ "--d": "80ms" } as React.CSSProperties}>
            Construa com gente
          </span>
          <br />
          <span className="hero-in inline-block" style={{ "--d": "180ms" } as React.CSSProperties}>
            não
          </span>
          {/*
           * A tecla não entra no fluxo da linha: o span reserva só a largura
           * visível e a imagem sobe 0,1em sobre a primeira linha, como na
           * referência. Margem transparente medida no PNG: 8,8% à esquerda,
           * 5,5% em cima, 5% embaixo.
           */}
          <span
            aria-hidden="true"
            className="group/key relative mx-[0.34em] inline-block h-[0.7em] w-[1.52em] align-baseline"
          >
            <span
              className="key-in absolute inset-0 block"
              style={{ "--d": "320ms" } as React.CSSProperties}
            >
              <img
                src="/keycap-peace.webp"
                alt=""
                draggable={false}
                width={1312}
                height={1199}
                className="absolute bottom-[-0.33em] left-[-0.17em] z-10 h-[1.72em] w-auto max-w-none select-none transition-transform duration-150 ease-out group-hover/key:translate-y-[0.035em] group-hover/key:scale-[0.985] [filter:drop-shadow(0_0.03em_0.04em_rgba(60,20,0,0.22))_drop-shadow(0_0.14em_0.28em_rgba(60,20,0,0.26))]"
              />
            </span>
          </span>
          {/* A tecla é decorativa; sem este espaço o leitor de tela lê "nãosozinho". */}
          <span className="sr-only"> </span>
          <span
            className="type-in inline-block font-pixel text-[1.18em] font-normal leading-none tracking-[-0.02em]"
            style={{ "--d": "820ms" } as React.CSSProperties}
          >
            sozinho
          </span>
        </h1>

        <p
          className="hero-in mt-6 max-w-[520px] text-base leading-[1.5] text-muted-foreground"
          style={{ "--d": "460ms" } as React.CSSProperties}
        >
          Encontre uma startup para fazer parte ou monte o time do seu projeto. Quem publica escolhe
          quem entra.
        </p>

        <div
          className="hero-in mt-8 flex flex-wrap items-center justify-center gap-2"
          style={{ "--d": "560ms" } as React.CSSProperties}
        >
          <button type="button" onClick={onPublish} className={buttonPrimary("h-10")}>
            {publishLabel}
          </button>
          <button type="button" onClick={onExplore} className={buttonGhost("h-10")}>
            {total === 0 ? "Quero entrar num time" : "Explorar projetos"}
          </button>
        </div>

        <HeroSearch
          value={draft}
          onChange={onDraft}
          onSubmit={onSearch}
          className="hero-in mt-6"
          style={{ "--d": "660ms" } as React.CSSProperties}
        />
      </div>

      {/* Faixa de categorias, como a faixa de logos: monocromática até o hover. */}
      <div
        className="hero-in relative border-y border-edge bg-background/70 backdrop-blur-sm"
        style={{ "--d": "760ms" } as React.CSSProperties}
      >
        <div className="clyro-scroll mx-auto flex max-w-[1200px] items-center gap-1 overflow-x-auto px-4 py-4 sm:justify-between sm:px-6">
          {FEATURED_CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategory(c.id)}
                className={cn(
                  "group flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[15px] font-medium tracking-[-0.02em] transition-colors",
                  active
                    ? "bg-surface-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mascot
                  pose={c.pose}
                  size={22}
                  className={cn(
                    "transition-[filter,opacity,transform] duration-300 ease-clyro group-hover:-translate-y-0.5 group-hover:-rotate-6",
                    active
                      ? ""
                      : "opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0",
                  )}
                />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Faixas lado a lado, cada uma com uma grade 2x2, rolando na horizontal. */
function CategoryBands({
  bands,
}: {
  bands: ((typeof CATEGORIES)[number] & { projects: ProjectCard[] })[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <section aria-labelledby="por-area">
      <SectionHead
        id="por-area"
        title="Projetos por área"
        action={
          bands.length > 2 ? (
            <button
              type="button"
              aria-label="Mais categorias"
              onClick={() => scroller.current?.scrollBy({ left: 400, behavior: "smooth" })}
              className={buttonGhost("h-9 w-9 shrink-0 px-0")}
            >
              <ArrowRight2 size={16} color="currentColor" />
            </button>
          ) : null
        }
      />
      <div
        ref={scroller}
        className="-mx-4 flex snap-x gap-4 overflow-x-auto scroll-smooth px-4 py-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {bands.map((band, i) => (
          <Reveal
            key={band.id}
            i={i}
            className="hairline-card w-[min(82vw,380px)] shrink-0 snap-start p-2"
          >
            <div className="flex items-center gap-2 px-2 pb-3 pt-1.5">
              <Mascot pose={band.pose} size={20} />
              <h3 className="flex-1 text-[15px] font-medium tracking-[-0.015em]">{band.label}</h3>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {band.projects.length} {band.projects.length === 1 ? "projeto" : "projetos"}
              </span>
            </div>
            <div className="grid aspect-[10/9] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-[4px]">
              {[0, 1, 2, 3].map((i) => {
                const p = band.projects[i];
                return p ? (
                  <ProjectTile key={p.id} project={p} />
                ) : (
                  <div key={i} className="flex items-center justify-center bg-surface-1">
                    <Mascot pose={band.pose} size={40} className="opacity-30 grayscale" />
                  </div>
                );
              })}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
