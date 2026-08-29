import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Compass,
  Hash,
  Heart,
  ListChecks,
  Megaphone,
  Menu,
  MessageCircle,
  Mic,
  Play,
  ShieldCheck,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClyroMark, ClyroWordmark } from "@/components/clyro/primitives";
import { Reveal } from "@/components/clyro/reveal";

const NAV_LINKS = [
  { href: "#projects", label: "Projects" },
  { href: "#updates", label: "Updates" },
  { href: "#community", label: "Community" },
  { href: "#discover", label: "Discover" },
];

/* ------------------------------------------------------------------ base */

/** A barra só ganha fundo e borda depois que a página sai do topo. */
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}

/* ------------------------------------------------------------------- nav */

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled();

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500 ease-clyro",
        scrolled || open
          ? "border-white/10 bg-stage/70 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-20 max-w-[1600px] items-center px-6 sm:px-10">
        <Link to="/" className="shrink-0 transition-opacity duration-200 hover:opacity-80">
          <ClyroWordmark />
        </Link>

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="group relative text-[15px] text-white/70 transition-colors duration-200 hover:text-white"
              >
                {link.label}
                <span className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-white transition-transform duration-300 ease-clyro group-hover:scale-x-100" />
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 sm:gap-5">
          {!signedIn && (
            <Link
              to="/auth"
              className="hidden text-[15px] text-white/70 transition-colors duration-200 hover:text-white sm:block"
            >
              Sign in
            </Link>
          )}
          <Button
            asChild
            size="sm"
            className="h-10 rounded-full bg-white px-5 font-medium text-[var(--color-rail)] hover:bg-white/90"
          >
            <Link to={signedIn ? "/app" : "/auth"}>
              {signedIn ? "Open Clyro" : "Create account"}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative text-white hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Menu
              className={cn(
                "absolute transition-all duration-300 ease-clyro",
                open ? "rotate-90 scale-75 opacity-0" : "rotate-0 scale-100 opacity-100",
              )}
            />
            <X
              className={cn(
                "absolute transition-all duration-300 ease-clyro",
                open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-75 opacity-0",
              )}
            />
          </Button>
        </div>
      </nav>

      {/* abre por altura, não por display: nada aparece de estalo */}
      <div
        className={cn(
          "grid overflow-hidden border-white/10 transition-[grid-template-rows,opacity,border-color] duration-400 ease-clyro lg:hidden",
          open ? "grid-rows-[1fr] border-t opacity-100" : "grid-rows-[0fr] border-t-0 opacity-0",
        )}
      >
        <ul className="min-h-0 bg-stage/95 px-6 backdrop-blur-xl">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="block py-3 text-[15px] text-white/70 transition-colors duration-200 first:pt-4 last:pb-4 hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

/**
 * Foto de fundo do hero — mãos se tocando, silhueta escura sobre fundo claro.
 * É esse contraste que faz o `multiply` funcionar: o claro deixa o azul passar,
 * a silhueta vira sombra dentro do campo.
 */
const HERO_PHOTO = "/hero-hands.jpg";

/**
 * As quatro linhas verticais do layout, em porcentagem da viewport. Elas são a
 * régua de tudo: o conteúdo começa na primeira e termina na última, e cada
 * palavra do título nasce exatamente sobre uma delas.
 */
const GUIDES = [5, 35, 65, 95];

const HERO_STATS = [
  { value: "1 min", label: "To your first update" },
  { value: "0", label: "Downloads or installs" },
  { value: "∞", label: "Members and updates" },
  { value: "100%", label: "Free during open beta" },
];

/** As mesmas réguas do hero, para as seções que continuam o campo azul. */
function GuideLines({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 hidden lg:block", className)}
    >
      {GUIDES.map((position) => (
        <span
          key={position}
          className="absolute inset-y-0 w-px bg-white/10"
          style={{ left: `${position}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Oito alças nos cantos e nos meios das bordas — o mesmo desenho de uma caixa
 * de transformação de ferramenta de design. Puramente decorativo.
 */
const SELECTION_HANDLES = [
  "left-0 top-0",
  "left-1/2 top-0",
  "left-full top-0",
  "left-0 top-1/2",
  "left-full top-1/2",
  "left-0 top-full",
  "left-1/2 top-full",
  "left-full top-full",
];

function SelectionFrame({
  children,
  className,
  delay = 620,
  spread = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Afasta a moldura do conteúdo, em px — para peças que já têm borda própria. */
  spread?: number;
}) {
  return (
    <span className={cn("relative block", className)}>
      {/*
        A moldura é exatamente a célula da grade — nem um pixel a mais. É isso
        que faz a aresta direita de uma cair sobre a régua onde a outra começa,
        sem sobreposição.
      */}
      <span
        aria-hidden="true"
        className="clyro-fade-in pointer-events-none absolute hidden lg:block"
        style={{ inset: -spread, animationDelay: `${delay}ms`, animationDuration: "0.9s" }}
      >
        <span className="absolute inset-0 border border-white/20" />
        {SELECTION_HANDLES.map((position) => (
          <span
            key={position}
            className={cn(
              "absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-white/80",
              position,
            )}
          />
        ))}
      </span>
      {children}
    </span>
  );
}

export function LandingHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="clyro-field relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      {HERO_PHOTO ? (
        <div
          aria-hidden="true"
          className="clyro-photo pointer-events-none absolute inset-x-0 bottom-0 top-[20%]"
          style={{ backgroundImage: `url("${HERO_PHOTO}")` }}
        />
      ) : null}
      <div aria-hidden="true" className="clyro-veil pointer-events-none absolute inset-0" />

      {/* as réguas do layout */}
      <GuideLines />

      <div className="relative flex flex-1 flex-col justify-center py-32 lg:py-28">
        <div className="mx-6 sm:mx-10 lg:mx-[5%]">
          <div className="grid gap-y-4 lg:grid-cols-3 lg:gap-y-0">
            <h1 className="contents font-light leading-[1.04] tracking-[-0.035em] text-white">
              <span className="clyro-enter block text-[clamp(2.5rem,6vw,7.75rem)] lg:col-start-1 lg:row-start-1">
                Build.
              </span>

              {/* só "Something" recebe a caixa; "worth" fica solto na linha de baixo */}
              <SelectionFrame className="lg:col-start-2 lg:row-start-1" delay={640}>
                <span
                  className="clyro-enter block text-[clamp(2.5rem,6vw,7.75rem)]"
                  style={{ animationDelay: "90ms" }}
                >
                  Something
                </span>
              </SelectionFrame>

              <span
                className="clyro-enter block text-[clamp(2.5rem,6vw,7.75rem)] lg:col-start-2 lg:row-start-2"
                style={{ animationDelay: "150ms" }}
              >
                worth
              </span>

              <SelectionFrame className="lg:col-start-3 lg:row-start-2" delay={780}>
                <span
                  className="clyro-enter block text-[clamp(2.5rem,6vw,7.75rem)]"
                  style={{ animationDelay: "210ms" }}
                >
                  following.
                </span>
              </SelectionFrame>
            </h1>

            <p
              className="clyro-enter mt-2 max-w-[24rem] text-[15px] leading-[1.5] text-white/85 lg:col-start-1 lg:row-start-2 lg:mt-6 lg:max-w-[80%] lg:self-start"
              style={{ animationDelay: "260ms" }}
            >
              Clyro gives your project a public home. Post updates, show what you are shipping, and
              let the people who care follow along.
            </p>
          </div>

          <div
            className="clyro-enter mt-12 flex flex-wrap items-center gap-3 lg:mt-16 lg:justify-center"
            style={{ animationDelay: "340ms" }}
          >
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-white px-7 text-[15px] font-medium text-[var(--color-rail)] hover:bg-white/90"
            >
              <Link to={signedIn ? "/app" : "/auth"}>
                {signedIn ? "Open Clyro" : "Start your space"}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-12 rounded-full border border-white/25 bg-white/15 px-7 text-[15px] font-medium text-white backdrop-blur-md hover:bg-white/25 hover:text-white"
            >
              <Link to="/app">Explore projects</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* faixa de números: grade de quatro, texto alinhado à primeira régua */}
      <div className="relative border-t border-white/15">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {HERO_STATS.map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                "clyro-enter px-6 py-8 sm:px-10 lg:px-0 lg:py-10 lg:pl-[5vw]",
                index > 0 && "md:border-l md:border-white/12",
                index >= 2 && "border-t border-white/12 md:border-t-0",
                index === 1 && "border-l border-white/12",
                index === 3 && "border-l border-white/12",
              )}
              style={{ animationDelay: `${420 + index * 70}ms` }}
            >
              <div className="text-[clamp(1.75rem,3.2vw,2.9rem)] font-light leading-none tracking-[-0.02em] text-white">
                {stat.value}
              </div>
              <div className="mt-2.5 text-xs text-white/70 sm:text-[13px]">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------- captura do produto */

const MEMBERS = [
  { name: "Ana", role: "moderator" },
  { name: "Rafa", role: "following for 3 months" },
  { name: "Duda", role: "following" },
  { name: "Iris", role: "following" },
  { name: "Theo", role: "following" },
];

export function LandingShowcase() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-surface">
      <div aria-hidden="true" className="clyro-afterglow pointer-events-none absolute inset-0" />
      <GuideLines className="opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
        <Reveal variant="scale">
          <SelectionFrame spread={16} delay={260}>
            <AppWindow />
          </SelectionFrame>
        </Reveal>
      </div>
    </section>
  );
}

function AppWindow() {
  return (
    <div className="clyro-surface overflow-hidden rounded-2xl text-left">
      <div className="flex h-10 items-center gap-2 border-b border-border bg-rail px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/12" />
        <span className="ml-3 text-[11px] text-muted-foreground">clyro.app / clyro</span>
      </div>

      <div className="flex h-[420px] sm:h-[520px] lg:h-[580px]">
        {/* rail de projetos */}
        <div className="hidden w-[72px] shrink-0 flex-col items-center gap-3 border-r border-border bg-rail py-4 sm:flex">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
            <ClyroMark className="h-5 w-5 text-primary-foreground" glyphClassName="text-primary" />
          </span>
          <span className="h-px w-8 bg-border" />
          {["CL", "NB", "PX"].map((project, i) => (
            <span
              key={project}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-xs font-medium text-secondary-foreground transition-colors duration-300",
                i === 0 && "ring-2 ring-brand",
              )}
            >
              {project}
            </span>
          ))}
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground">
            <Compass className="h-4 w-4" />
          </span>
        </div>

        {/* canais do projeto */}
        <div className="hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar sm:flex">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-medium">Clyro</div>
            <div className="text-[11px] text-muted-foreground">
              public project · 1,284 following
            </div>
          </div>
          <div className="flex-1 space-y-1 p-2">
            <ChannelLabel>Project</ChannelLabel>
            <ChannelRow icon={Megaphone} label="updates" active />
            <ChannelRow icon={ListChecks} label="roadmap" />
            <ChannelRow icon={Hash} label="bugs" />
            <ChannelLabel>Community</ChannelLabel>
            <ChannelRow icon={Hash} label="general" />
            <ChannelRow icon={Hash} label="show-your-work" />
            <ChannelRow icon={Volume2} label="friday call" />
            <div className="space-y-1.5 pl-7 pt-1.5">
              {["Ana", "Rafa"].map((name) => (
                <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Initials label={name} className="h-5 w-5 text-[9px]" />
                  {name}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-3">
            <Initials label="you" className="h-7 w-7 text-[10px]" />
            <span className="text-xs">you</span>
            <span className="ml-auto text-[10px] text-muted-foreground">maker</span>
          </div>
        </div>

        {/* feed de atualizações */}
        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">updates</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              1,284
            </span>
          </div>

          <div className="flex flex-1 flex-col justify-end gap-4 overflow-hidden p-5">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                today
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <article className="clyro-surface-soft rounded-2xl p-4">
              <div className="flex items-center gap-2.5">
                <Initials label="Luis" className="h-8 w-8 text-[11px]" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Luis</span>
                    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">
                      maker
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">2 hours ago</span>
                </div>
              </div>

              <h4 className="mt-3 text-sm font-medium">v1.4 — inline comments and mentions</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                You can now reply right under each update. Recorded 40 seconds showing how it works.
              </p>

              <div className="clyro-surface-soft mt-3 flex aspect-[16/7] items-center justify-center rounded-xl">
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border">
                    <Play className="h-3 w-3 fill-current" />
                  </span>
                  demo-v1.4.mp4 · 0:42
                </span>
              </div>

              <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Heart className="h-3.5 w-3.5 fill-current text-brand-strong" />
                  128
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  24 comments
                </span>
              </div>
            </article>

            <div className="flex gap-3 pl-4">
              <Initials label="Ana" className="h-7 w-7 text-[10px]" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">Ana</span>
                  <span className="text-[10px] text-muted-foreground">now</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  this is exactly what I asked for on the roadmap 👏
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pl-4 text-[11px] text-muted-foreground">
              <TypingDots />
              Rafa is commenting
            </div>
          </div>

          <div className="p-4">
            <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              Post an update in #updates
            </div>
          </div>
        </div>

        {/* quem acompanha */}
        <div className="hidden w-56 shrink-0 flex-col border-l border-border bg-sidebar lg:flex">
          <div className="px-4 pb-2 pt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Following — 1,284
          </div>
          <div className="space-y-0.5 p-2">
            {MEMBERS.map((member) => (
              <div key={member.name} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                <Initials label={member.name} className="h-7 w-7 text-[10px]" />
                <span className="min-w-0">
                  <span className="block text-xs">{member.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {member.role}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="clyro-typing h-1 w-1 rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

function Waveform({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-end gap-[3px]", className)} aria-hidden="true">
      {[7, 12, 5, 14, 9, 4, 11].map((height, i) => (
        <span
          key={i}
          className="clyro-wave w-[3px] rounded-full bg-brand-soft"
          style={{ height, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ fold */

export function LandingFlow() {
  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-surface">
      <div
        aria-hidden="true"
        className="clyro-afterglow pointer-events-none absolute inset-0 opacity-35"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <Reveal className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <span className="text-[11px] uppercase tracking-[0.22em] text-brand-soft">
              From first post to community
            </span>
            <h2 className="mt-6 text-balance text-[clamp(2.1rem,4.2vw,3.6rem)] font-light leading-[1.03] tracking-[-0.03em]">
              Your project leaves the repo and finds an audience.
            </h2>
          </div>
          <p className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground md:text-right">
            No newsletter to set up, no server to configure, no social feed deciding who gets to see
            your work.
          </p>
        </Reveal>

        <div className="mt-16 grid border-t border-border md:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 120}>
              <div
                className={cn(
                  "group h-full border-border py-10 md:px-9",
                  index > 0 && "border-t md:border-l md:border-t-0",
                  index === 0 && "md:pl-0",
                  index === STEPS.length - 1 && "md:pr-0",
                )}
              >
                <div className="flex items-baseline gap-3">
                  <span className="text-[11px] tracking-[0.18em] text-muted-foreground transition-colors duration-300 group-hover:text-brand-soft">
                    {step.number}
                  </span>
                  <span className="h-px flex-1 bg-border transition-colors duration-500 ease-clyro group-hover:bg-brand/60" />
                </div>
                <h3 className="mt-6 text-2xl font-normal tracking-[-0.022em]">{step.title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <div className="mt-8">{step.visual}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="clyro-surface-soft clyro-lift flex h-32 items-center justify-center rounded-2xl px-5">
      {children}
    </div>
  );
}

const STEPS = [
  {
    number: "01",
    title: "Create the space",
    body: "Name, description and the channels your project needs. A minute later it has its own address to share.",
    visual: (
      <StepFrame>
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-2">
            {["CL", "NB", "PX"].map((project, i) => (
              <span
                key={project}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-[10px] font-medium text-secondary-foreground transition-transform duration-300 ease-clyro",
                  i === 0 && "bg-brand text-white group-hover:scale-105",
                )}
              >
                {project}
              </span>
            ))}
          </div>
          <div className="w-32 space-y-1.5">
            <ChannelRow icon={Megaphone} label="updates" active />
            <ChannelRow icon={ListChecks} label="roadmap" />
            <ChannelRow icon={Hash} label="general" />
          </div>
        </div>
      </StepFrame>
    ),
  },
  {
    number: "02",
    title: "Post the update",
    body: "Text, screenshot or the video of what just shipped. Everyone following the project hears about it right away.",
    visual: (
      <StepFrame>
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2">
            <Initials label="Luis" className="h-6 w-6 text-[9px]" />
            <span className="text-[11px] font-medium">v1.4 is live</span>
            <span className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white transition-transform duration-300 ease-clyro group-hover:scale-110">
              <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
          <div className="clyro-surface-soft flex h-12 items-center justify-center rounded-xl">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Play className="h-2.5 w-2.5 fill-current" />
              demo-v1.4.mp4
            </span>
          </div>
        </div>
      </StepFrame>
    ),
  },
  {
    number: "03",
    title: "The community answers",
    body: "Comments live under the update itself — and the friday call happens in the same space.",
    visual: (
      <StepFrame>
        <div className="w-full space-y-2.5">
          {["Ana", "Rafa"].map((name, i) => (
            <div key={name} className="flex items-center gap-2">
              <Initials label={name} className="h-6 w-6 text-[9px]" />
              <span
                className="h-1.5 rounded-full bg-secondary transition-colors duration-500 ease-clyro group-hover:bg-brand/70"
                style={{ width: i === 0 ? "58%" : "42%" }}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">friday call · 6 in the room</span>
            <Waveform className="ml-auto" />
          </div>
        </div>
      </StepFrame>
    ),
  },
];

/* ----------------------------------------------------------- primitivas */

function Initials({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground",
        className,
      )}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function ChannelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function ChannelRow({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof Hash;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-200",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", active && "text-brand-soft")} />
      {label}
    </div>
  );
}

/* -------------------------------------------------------------- features */

export function LandingFeatures() {
  return (
    <>
      <FeatureRow
        id="projects"
        eyebrow="Projects"
        title="A public home that belongs to your project"
        body="Every project gets its own page — description, channels and a follow button. People understand what you are building in ten seconds, and hear about the next release without having to look for it."
        visual={<ProjectVisual />}
      />
      <FeatureRow
        id="updates"
        eyebrow="Updates"
        title="Publish what you just built"
        body="A changelog that is more than text: write the update, attach the demo video, the screenshot of the new screen or the story behind the decision. It all stays in order, inside the project."
        visual={
          <SelectionFrame spread={14} delay={420}>
            <UpdateVisual />
          </SelectionFrame>
        }
        reversed
      />
      <FeatureRow
        id="community"
        eyebrow="Community"
        title="The discussion happens under what you posted"
        body="Inline comments, channels for questions and bugs, and voice rooms for when a thread deserves a conversation. Feedback arrives with its context attached, not scattered across five different tools."
        visual={<CommunityVisual />}
      />
    </>
  );
}

function FeatureRow({
  id,
  eyebrow,
  title,
  body,
  visual,
  reversed,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 sm:px-8 md:grid-cols-2 md:gap-16 md:py-24">
        <Reveal className={cn(reversed && "md:order-2")}>
          <span className="text-[11px] uppercase tracking-[0.22em] text-brand-soft">{eyebrow}</span>
          <h2 className="mt-5 text-balance text-[clamp(2.1rem,4.2vw,3.6rem)] font-light leading-[1.03] tracking-[-0.03em]">
            {title}
          </h2>
          <p className="mt-6 max-w-lg text-pretty text-[17px] leading-[1.65] text-muted-foreground">
            {body}
          </p>
        </Reveal>
        <Reveal className={cn("group", reversed && "md:order-1")} delay={140} variant="scale">
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

function VisualFrame({ children }: { children: React.ReactNode }) {
  return <div className="clyro-surface clyro-lift rounded-2xl p-5">{children}</div>;
}

function ProjectVisual() {
  return (
    <VisualFrame>
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-sm font-medium text-white">
          CL
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Clyro</div>
          <div className="text-xs text-muted-foreground">public project · updated today</div>
        </div>
        <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform duration-300 ease-clyro group-hover:scale-105">
          Following
        </span>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Community platform for people building in public. In development since 2025.
      </p>

      <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-2xl border border-border">
        {[
          { value: "1,284", label: "following" },
          { value: "36", label: "updates" },
          { value: "412", label: "threads" },
        ].map((stat) => (
          <div key={stat.label} className="px-3 py-3 text-center">
            <div className="text-sm font-medium">{stat.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        <ChannelRow icon={Megaphone} label="updates" active />
        <ChannelRow icon={ListChecks} label="roadmap" />
        <ChannelRow icon={Hash} label="general" />
      </div>
    </VisualFrame>
  );
}

function UpdateVisual() {
  return (
    <VisualFrame>
      <div className="flex items-center gap-2.5">
        <Initials label="Luis" className="h-8 w-8 text-[11px]" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Luis</span>
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">
              maker
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">posted an update</span>
        </div>
      </div>

      <h4 className="mt-4 text-sm font-medium">v1.4 — inline comments and mentions</h4>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        You can reply right under each update. Here is the 40 second walkthrough.
      </p>

      <div className="clyro-surface-soft mt-4 flex aspect-video items-center justify-center rounded-2xl">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white transition-transform duration-300 ease-clyro group-hover:scale-110">
          <Play className="h-4 w-4 fill-current" />
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Heart className="h-4 w-4 fill-current text-brand-strong transition-transform duration-300 ease-clyro group-hover:scale-110" />
          128
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle className="h-4 w-4" />
          24
        </span>
        <span className="ml-auto">2 hours ago</span>
      </div>
    </VisualFrame>
  );
}

const COMMUNITY_THREAD = [
  { name: "Ana", text: "this is exactly what I asked for on the roadmap 👏", nested: false },
  { name: "Luis", text: "it was the most requested one — thanks for pushing", nested: true },
  { name: "Duda", text: "tested it here, mentions notify properly", nested: false },
];

function CommunityVisual() {
  return (
    <VisualFrame>
      <div className="flex items-center gap-2 pb-4 text-sm">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">24 comments</span>
        <span className="ml-auto text-xs text-muted-foreground">on v1.4</span>
      </div>

      <div className="space-y-3">
        {COMMUNITY_THREAD.map((comment) => (
          <div key={comment.name} className={cn("flex gap-2.5", comment.nested && "pl-8")}>
            <Initials label={comment.name} className="h-7 w-7 text-[10px]" />
            <div
              className={cn(
                "min-w-0 rounded-xl rounded-tl-sm px-3 py-2",
                comment.nested ? "bg-brand/15 ring-1 ring-brand/30" : "bg-stage",
              )}
            >
              <div className="text-[11px] font-medium">{comment.name}</div>
              <p className="text-xs text-muted-foreground">{comment.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="clyro-surface-soft mt-4 flex items-center gap-3 rounded-2xl px-3 py-2.5">
        <Volume2 className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-xs font-medium">friday call</div>
          <div className="text-[10px] text-muted-foreground">6 in the room · no scheduling</div>
        </div>
        <Waveform className="ml-auto" />
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white transition-transform duration-300 ease-clyro group-hover:scale-110">
          <Mic className="h-3.5 w-3.5" />
        </span>
      </div>
    </VisualFrame>
  );
}

/* ------------------------------------------------------------ benefícios */

const BENEFITS = [
  {
    icon: Compass,
    title: "Discovery",
    body: "Projects surface for people who follow similar things. Whoever lands on Clyro finds what is being built right now.",
  },
  {
    icon: Bell,
    title: "Release alerts",
    body: "Every update you publish reaches the people following the project — no reach algorithm in between.",
  },
  {
    icon: ShieldCheck,
    title: "Roles and moderation",
    body: "Decide who posts on behalf of the project, who moderates the community and who just follows along.",
  },
  {
    icon: ListChecks,
    title: "Open roadmap",
    body: "Show what is coming next and let the community vote and comment before you build it.",
  },
];

export function LandingBenefits() {
  return (
    <section id="discover" className="scroll-mt-20 border-b border-border bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-[clamp(2.1rem,4.2vw,3.6rem)] font-light leading-[1.03] tracking-[-0.03em]">
            Built for people who work in the open
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            From the weekend project to the SaaS with paying customers — the same tools to publish,
            collect feedback and keep close the people who care about what you make.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit, index) => (
            <Reveal key={benefit.title} delay={index * 90}>
              <div className="clyro-surface clyro-lift group h-full rounded-2xl p-6">
                <benefit.icon className="h-5 w-5 text-brand-soft transition-transform duration-300 ease-clyro group-hover:-translate-y-0.5" />
                <h3 className="mt-5 text-lg font-normal tracking-[-0.015em]">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{benefit.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- cta band */

export function LandingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="clyro-field relative isolate overflow-hidden border-b border-border">
      <div aria-hidden="true" className="clyro-veil pointer-events-none absolute inset-0" />
      <Reveal className="relative mx-auto max-w-3xl px-5 py-28 text-center">
        <ClyroMark className="mx-auto h-10 w-10" />
        <h2 className="mt-8 text-balance text-[clamp(2.5rem,5.4vw,4.75rem)] font-light leading-[1.02] tracking-[-0.032em] text-white">
          Your next release deserves an audience
        </h2>
        <p className="mt-5 text-pretty leading-relaxed text-white/80">
          Create the space, publish the first update and send the link to the people already
          watching you. The community grows from there.
        </p>
        <Button
          asChild
          size="lg"
          className="group mt-9 h-12 rounded-full bg-white px-7 font-medium text-[var(--color-rail)] hover:bg-white/90"
        >
          <Link to={signedIn ? "/app" : "/auth"}>
            {signedIn ? "Open Clyro" : "Start your space"}
            <ArrowRight className="transition-transform duration-300 ease-clyro group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Projects", href: "#projects" },
      { label: "Updates", href: "#updates" },
      { label: "Community", href: "#community" },
      { label: "Discover", href: "#discover" },
    ],
  },
  {
    title: "Makers",
    links: [
      { label: "Maker guide", href: "#projects" },
      { label: "Best practices", href: "#updates" },
      { label: "Weekly picks", href: "#discover" },
      { label: "Status", href: "#discover" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#discover" },
      { label: "Brand", href: "#discover" },
      { label: "Careers", href: "#discover" },
      { label: "Contact", href: "#discover" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "#discover" },
      { label: "Privacy", href: "#discover" },
      { label: "Guidelines", href: "#discover" },
      { label: "Security", href: "#discover" },
    ],
  },
];

export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <Reveal className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <ClyroWordmark />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Where a project finds its community — in blue and black.
            </p>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-sm font-medium">{column.title}</h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="inline-block text-sm text-muted-foreground transition-[color,transform] duration-200 ease-clyro hover:translate-x-0.5 hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>

        <div className="mt-12 flex flex-col items-start gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Clyro. All rights reserved.
          </span>
          <Button asChild size="sm" className="rounded-full sm:ml-auto">
            <Link to={signedIn ? "/app" : "/auth"}>{signedIn ? "Open Clyro" : "Sign in"}</Link>
          </Button>
        </div>
      </div>
    </footer>
  );
}
