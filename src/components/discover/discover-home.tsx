import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight2 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORIES,
  categoryOf,
  useDiscoverProjects,
  type ProjectCard,
} from "@/lib/project-queries";
import { Mascot } from "@/components/workspace/mascot";
import { PromoBanner, SiteNav, buttonGhost, buttonPrimary } from "./site-nav";
import { ProjectArt, ProjectTile } from "./project-tile";
import { ProjectDialog } from "./project-dialog";
import {
  Closing,
  MarkBadge,
  MascotMarks,
  NotebookFooter,
  ProductBoard,
  SectionHead,
  TwoSides,
  VerbPill,
  Workspace,
} from "./notebook";
import { HeroSearch } from "./hero-search";
import { Reveal, useMotionReady } from "@/hooks/use-reveal";

/**
 * A home do Clyro em planta baixa: fundo branco com grade fina, tipografia
 * preta apertada, rótulos em mono e um só laranja — o dos mascotes.
 */
export function DiscoverHome() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLElement>(null);

  const { data: all = [], isLoading } = useDiscoverProjects("", null);
  const filtering = search.trim() !== "" || category !== null;
  const { data: results = [] } = useDiscoverProjects(search.trim(), category);

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
  const publish = () => {
    if (!user) {
      void navigate({ to: "/auth", search: { next: "/?publicar=1" } });
      return;
    }
    setPublishOpen(true);
  };
  useEffect(() => {
    if (!publicar || !user) return;
    setPublishOpen(true);
    void navigate({ to: "/", search: {}, replace: true });
  }, [publicar, user, navigate]);

  const join = () => {
    void navigate(user ? { to: "/app" } : { to: "/auth" });
  };

  useMotionReady();

  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-paper text-foreground">
      <PromoBanner onClick={publish} />
      <SiteNav
        signedIn={Boolean(user)}
        profile={profile}
        onPublish={publish}
        items={[
          {
            label: "Descobrir",
            active: !filtering,
            onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
          },
          {
            label: "Categorias",
            active: category !== null,
            onClick: () => scrollTo(categoriesRef.current),
          },
          {
            label: "Recentes",
            onClick: () => scrollTo(recentRef.current ?? categoriesRef.current),
          },
          { label: "Minhas comunidades", to: "/app" },
        ]}
      />

      <Hero
        total={all.length}
        draft={draft}
        onDraft={setDraft}
        onSearch={() => {
          setSearch(draft);
          window.setTimeout(() => scrollTo(categoriesRef.current), 50);
        }}
        category={category}
        onPublish={publish}
        onExplore={() => scrollTo(tracksRef.current ?? categoriesRef.current)}
        onCategory={(id) => {
          setCategory(id === category ? null : id);
          window.setTimeout(() => scrollTo(categoriesRef.current), 50);
        }}
      />

      <main ref={categoriesRef} className="scroll-mt-20">
        {filtering ? (
          <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6 lg:py-32">
            <Results
              projects={results}
              title={
                search.trim()
                  ? `Resultados para “${search.trim()}”`
                  : (categoryOf(category)?.label ?? "Projetos")
              }
              onClear={() => {
                setSearch("");
                setDraft("");
                setCategory(null);
              }}
              onPublish={publish}
              onJoin={join}
              signedIn={Boolean(user)}
            />
          </div>
        ) : !isLoading && all.length > 0 ? (
          <div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 py-24 sm:px-6 lg:gap-32 lg:py-32">
            {byCategory.length > 0 && <CategoryBands bands={byCategory} />}
            <div ref={recentRef} className="scroll-mt-24">
              <Recent projects={all} />
            </div>
          </div>
        ) : null}

        <TwoSides
          innerRef={tracksRef}
          empty={all.length === 0}
          onPublish={publish}
          onJoin={join}
          signedIn={Boolean(user)}
        />
        <Workspace />
      </main>

      <Closing onPublish={publish} onJoin={join} />
      <NotebookFooter
        onPublish={publish}
        onCategory={(id) => {
          setCategory(id);
          window.setTimeout(() => scrollTo(categoriesRef.current), 50);
        }}
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

/**
 * Hero do caderno: a fila de mascotes, o título com o verbo numa pílula, a
 * serifa explicando, as duas ações, a busca de verdade e o quadro de pedidos
 * de um projeto como prova. As áreas ficam numa faixa logo abaixo.
 */
function Hero({
  total,
  draft,
  onDraft,
  onSearch,
  category,
  onCategory,
  onPublish,
  onExplore,
}: {
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
    <section className="relative">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-16">
        <MascotMarks />

        <h1 className="mt-8 text-[clamp(2.5rem,7.4vw,5.6rem)] font-bold leading-[1.04] tracking-[-0.048em]">
          <span className="hero-in inline-block" style={{ "--d": "120ms" } as React.CSSProperties}>
            Onde startups encontram
          </span>
          <br />
          <span className="hero-in inline-block" style={{ "--d": "200ms" } as React.CSSProperties}>
            gente para
          </span>{" "}
          <VerbPill />
        </h1>

        <p
          className="hero-in mt-6 max-w-[62ch] text-balance font-serif text-[clamp(1.05rem,1.6vw,1.25rem)] leading-[1.55] text-graphite"
          style={{ "--d": "380ms" } as React.CSSProperties}
        >
          Publique o seu projeto ou peça para entrar em um. Quem publica escolhe quem entra, e o
          time começa a trabalhar no mesmo lugar.
        </p>

        <div
          className="hero-in mt-8 flex flex-wrap items-center justify-center gap-2.5"
          style={{ "--d": "480ms" } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={onPublish}
            className={buttonPrimary("h-11 px-5 text-[15px]")}
          >
            Publicar projeto
          </button>
          <button
            type="button"
            onClick={onExplore}
            className={buttonGhost("h-11 px-5 text-[15px]")}
          >
            {total === 0 ? "Quero entrar num time" : "Explorar projetos"}
          </button>
        </div>

        <HeroSearch
          value={draft}
          onChange={onDraft}
          onSubmit={onSearch}
          className="hero-in mt-5"
          style={{ "--d": "560ms" } as React.CSSProperties}
        />
        <p
          className="hero-in mt-3 text-[13px] text-graphite"
          style={{ "--d": "600ms" } as React.CSSProperties}
        >
          {total === 0
            ? "Nenhum projeto aberto ainda: o primeiro pode ser o seu."
            : `${total} ${total === 1 ? "projeto aberto" : "projetos abertos"} em ${CATEGORIES.length} áreas.`}
        </p>

        {/* O produto, com os personagens espiando em volta. */}
        <div className="relative mt-14 w-full max-w-[1080px]">
          <MarkBadge
            pose="estrela"
            ring="#ffb110"
            doodle="lines"
            className="-left-24 top-[-36px]"
            delay={900}
          />
          <MarkBadge
            pose="brincando"
            ring="#62aef0"
            doodle="sparkle"
            className="-right-16 top-[-48px]"
            delay={1000}
          />
          <MarkBadge pose="sorte" ring="#ff6a13" className="-left-10 bottom-16" delay={1100} />
          <MarkBadge
            pose="energia"
            ring="#02093a"
            doodle="squiggle"
            className="-right-14 bottom-24"
            delay={1200}
          />
          <div className="hero-in" style={{ "--d": "700ms" } as React.CSSProperties}>
            <ProductBoard />
          </div>
        </div>
      </div>

      {/* Faixa de áreas: como uma parede de logos, em tinta apagada até o hover. */}
      <div className="relative">
        <div className="clyro-scroll mx-auto flex max-w-[1200px] items-center gap-1 overflow-x-auto px-4 pb-6 sm:justify-center sm:px-6">
          {CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onCategory(c.id)}
                aria-pressed={active}
                className={cn(
                  "group flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[15px] font-medium tracking-[-0.01em] transition-[background-color,color] duration-200",
                  active
                    ? "bg-white text-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
                    : "text-black/50 hover:bg-black/[0.04] hover:text-foreground",
                )}
              >
                <Mascot
                  pose={c.pose}
                  size={22}
                  className={cn(
                    "transition-[filter,opacity,transform] duration-300 [transition-timing-function:var(--ease-spring)] group-hover:-translate-y-0.5 group-hover:-rotate-6",
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

function ProjectRow({ project }: { project: ProjectCard }) {
  const cat = categoryOf(project.category);
  return (
    <Link
      to="/p/$projectId"
      params={{ projectId: project.id }}
      className="group block h-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <div className="hairline-card hairline-lift flex h-full flex-col overflow-hidden">
        <div className="aspect-[4/3] overflow-hidden border-b border-black/[0.06]">
          <ProjectArt
            project={project}
            mascotSize={88}
            className="transition-transform duration-700 ease-clyro group-hover:scale-[1.03]"
          />
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.015em]">
              {project.name}
            </p>
            {project.stage && (
              <span className="shrink-0 rounded-[4px] bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
                {project.stage}
              </span>
            )}
          </div>
          {project.tagline && (
            <p className="mt-1.5 line-clamp-2 text-sm leading-[1.55] text-ink-2">
              {project.tagline}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
            {cat && (
              <span className="flex items-center gap-1 text-xs font-medium">
                <Mascot pose={cat.pose} size={14} />
                {cat.label}
              </span>
            )}
            {project.looking_for.length > 0 && (
              <span className="truncate text-xs text-muted-foreground">
                · Procura {project.looking_for.slice(0, 2).join(", ")}
                {project.looking_for.length > 2 ? ` +${project.looking_for.length - 2}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Recent({ projects }: { projects: ProjectCard[] }) {
  return (
    <section aria-labelledby="recentes">
      <SectionHead
        id="recentes"
        title="Acabaram de abrir vagas"
        aside="Os projetos publicados por último, com as funções que ainda procuram."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.slice(0, 16).map((p, i) => (
          <Reveal key={p.id} i={i % 4}>
            <ProjectRow project={p} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Results({
  projects,
  title,
  onClear,
  onPublish,
  onJoin,
  signedIn,
}: {
  projects: ProjectCard[];
  title: string;
  onClear: () => void;
  onPublish: () => void;
  onJoin: () => void;
  signedIn: boolean;
}) {
  return (
    <section aria-labelledby="resultados">
      <SectionHead
        id="resultados"
        title={title}
        aside={`${projects.length} ${projects.length === 1 ? "projeto encontrado" : "projetos encontrados"}.`}
        action={
          <button type="button" onClick={onClear} className={buttonGhost("h-9 shrink-0")}>
            Limpar
          </button>
        }
      />
      {projects.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p, i) => (
            <Reveal key={p.id} i={i % 4}>
              <ProjectRow project={p} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="hairline-card grid overflow-hidden md:grid-cols-[1.1fr_1fr]">
          <div className="flex items-center gap-5 p-6 sm:p-8">
            <Mascot pose="chuva" size={88} float className="shrink-0" />
            <div>
              <p className="text-xl font-[480] tracking-[-0.025em]">Nenhum projeto aqui ainda</p>
              <p className="mt-1 max-w-[42ch] text-sm leading-[1.55] text-ink-2">
                Tente outra categoria ou outra palavra. Ou veja tudo o que já está aberto.
              </p>
              <button type="button" onClick={onClear} className={buttonGhost("mt-4 h-10")}>
                Ver todos os projetos
              </button>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-4 border-t border-black/[0.06] bg-surface-1 p-6 sm:p-8 md:border-l md:border-t-0">
            <div>
              <p className="text-base font-medium tracking-[-0.015em]">Tem um projeto assim?</p>
              <p className="text-sm text-ink-2">Publique e seja o primeiro da lista.</p>
              <button type="button" onClick={onPublish} className={buttonPrimary("mt-3 h-10")}>
                Publicar projeto
              </button>
            </div>
            <div className="border-t border-black/[0.06] pt-4">
              <p className="text-base font-medium tracking-[-0.015em]">Quer entrar num assim?</p>
              <p className="text-sm text-ink-2">
                {signedIn
                  ? "Seu perfil já está pronto para quando um abrir."
                  : "Crie sua conta para pedir entrada quando um abrir."}
              </p>
              <button type="button" onClick={onJoin} className={buttonGhost("mt-3 h-10")}>
                {signedIn ? "Abrir meu perfil" : "Criar minha conta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
