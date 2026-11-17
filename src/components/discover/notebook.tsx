import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Calendar1,
  Element3,
  Hashtag,
  Home2,
  People,
  SearchNormal1,
  TickCircle,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/project-queries";
import { Reveal, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { ClyroMark } from "@/components/clyro/primitives";
import { Mascot, type MascotPose } from "@/components/workspace/mascot";
import { buttonGhost, buttonPrimary } from "./site-nav";
import {
  CallPreview,
  DecisionLog,
  EntryFormPreview,
  RequestPreview,
  RolesPreview,
  WorkspacePreview,
} from "./previews";

/*
 * A landing como um caderno ao sol da tarde: papel morno, cartões brancos com
 * linha fina, títulos densos e uma serifa só nas aberturas. A cor vem de um
 * elenco de post-its que pinta os painéis; o laranja do mascote é só a ação.
 */

/* ------------------------------------------------------------------ */
/* Personagens: os mascotes em círculos, como a fila de rostos do topo.  */
/* ------------------------------------------------------------------ */

const RING = ["#ff6a13", "#62aef0", "#ffb110", "#02093a", "#f6d5b8", "#62aef0", "#ff6a13"];
const CAST: MascotPose[] = [
  "estrela",
  "energia",
  "neutro",
  "brincando",
  "sorte",
  "chuva",
  "neutro",
];

/** Fila de mascotes no topo do hero. Entram um por um, com mola. */
export function MascotMarks() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center">
      {CAST.map((pose, i) => (
        <span
          key={i}
          className="mark-pop -ml-2 first:ml-0"
          style={
            { "--d": `${i * 55}ms`, zIndex: CAST.length - Math.abs(3 - i) } as React.CSSProperties
          }
        >
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-1.5 hover:rotate-[-6deg] sm:h-14 sm:w-14"
            style={{ boxShadow: `0 0 0 2px ${RING[i]}` }}
          >
            <Mascot pose={pose} size={34} />
          </span>
        </span>
      ))}
    </div>
  );
}

/** Mascote solto com um rabisco do lado, espalhado em volta do produto. */
export function MarkBadge({
  pose,
  ring,
  doodle,
  className,
  delay = 0,
}: {
  pose: MascotPose;
  ring: string;
  doodle?: "squiggle" | "sparkle" | "lines";
  className?: string;
  delay?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mark-pop pointer-events-none absolute z-10 hidden items-center gap-2 lg:flex",
        className,
      )}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {doodle === "lines" && <Doodle kind="lines" className="mr-1" />}
      <span
        className="mark-bob flex h-14 w-14 items-center justify-center rounded-full bg-white"
        style={{ boxShadow: `0 0 0 2px ${ring}` }}
      >
        <Mascot pose={pose} size={38} />
      </span>
      {doodle && doodle !== "lines" && <Doodle kind={doodle} />}
    </div>
  );
}

/** Rabiscos à mão: traço solto, sem preenchimento, na cor da tinta. */
export function Doodle({
  kind,
  className,
}: {
  kind: "squiggle" | "sparkle" | "lines";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "sparkle") {
    return (
      <svg
        viewBox="0 0 32 32"
        className={cn("h-7 w-7 text-foreground", className)}
        aria-hidden="true"
      >
        <path {...common} d="M10 4v8M6 8h8M24 14v6M21 17h6M14 22l-3 5" />
      </svg>
    );
  }
  if (kind === "lines") {
    return (
      <svg
        viewBox="0 0 64 24"
        className={cn("h-6 w-16 text-foreground", className)}
        aria-hidden="true"
      >
        <path {...common} d="M2 8c14-6 34-7 58-1M8 18c12-4 26-5 42-1" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 40 24"
      className={cn("h-6 w-10 text-foreground", className)}
      aria-hidden="true"
    >
      <path {...common} d="M3 18c4-10 8-10 10 0s6 10 10 0 8-10 14-4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Verbo na pílula: a palavra que troca dentro do título.               */
/* ------------------------------------------------------------------ */

const VERBS = [
  { word: "construir", dot: "#ff6a13" },
  { word: "lançar", dot: "#62aef0" },
  { word: "testar", dot: "#ffb110" },
  { word: "crescer", dot: "#1f9d55" },
];

export function VerbPill() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [width, setWidth] = useState<number | null>(null);
  const measure = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) return;
    // Começa a girar depois da entrada do hero; para quando a aba some.
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setI((v) => (v + 1) % VERBS.length);
    }, 2600);
    return () => window.clearInterval(t);
  }, [reduced]);

  // A pílula acompanha a largura da palavra, sem pular.
  useLayoutEffect(() => {
    if (measure.current) setWidth(measure.current.offsetWidth);
  }, [i]);

  const verb = VERBS[i] ?? VERBS[0]!;
  return (
    <span className="relative inline-flex align-baseline">
      <span
        className="pill-pop inline-flex items-center gap-[0.18em] overflow-hidden rounded-full bg-peach px-[0.32em] py-[0.02em] align-baseline transition-[width] duration-500 [transition-timing-function:cubic-bezier(0.34,1.4,0.64,1)]"
        style={{ width: width ? width : undefined, "--d": "260ms" } as React.CSSProperties}
      >
        <span
          className="h-[0.26em] w-[0.26em] shrink-0 rounded-full transition-colors duration-500"
          style={{ background: verb.dot }}
        />
        <span key={verb.word} className="word-in whitespace-nowrap">
          {verb.word}
        </span>
      </span>
      {/* Medidor invisível com a mesma caixa, para a largura da próxima palavra. */}
      <span
        ref={measure}
        aria-hidden="true"
        className="invisible absolute left-0 top-0 inline-flex items-center gap-[0.18em] whitespace-nowrap px-[0.32em]"
      >
        <span className="h-[0.26em] w-[0.26em]" />
        {verb.word}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* O produto no hero: o quadro de pedidos de um projeto.                */
/* ------------------------------------------------------------------ */

type Ticket = { role: string; text: string; pose: MascotPose };

const BOARD: { title: string; tone: string; ink: string; tickets: Ticket[] }[] = [
  {
    title: "Novos",
    tone: "#fdecc8",
    ink: "#7a4a00",
    tickets: [
      { role: "Design", text: "Quero desenhar o onboarding", pose: "brincando" },
      { role: "Dev", text: "Já fiz dois apps em React Native", pose: "energia" },
      { role: "Marketing", text: "Cuido de lançamento e conteúdo", pose: "sorte" },
    ],
  },
  {
    title: "Em conversa",
    tone: "#e6f3fe",
    ink: "#0b5394",
    tickets: [
      { role: "Cofounder", text: "Topo dividir o produto", pose: "estrela" },
      { role: "Dados", text: "Posso montar as métricas", pose: "neutro" },
    ],
  },
  {
    title: "No time",
    tone: "#dff3e4",
    ink: "#1f6b35",
    tickets: [
      { role: "Produto", text: "Entrou no workspace", pose: "energia" },
      { role: "Beta tester", text: "Entrou no workspace", pose: "chuva" },
    ],
  },
];

const SIDEBAR: { icon: typeof Home2; label: string; badge?: string; active?: boolean }[] = [
  { icon: Home2, label: "Início" },
  { icon: SearchNormal1, label: "Descobrir" },
  { icon: People, label: "Pedidos", badge: "3", active: true },
  { icon: Calendar1, label: "Agenda" },
];

export function ProductBoard() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-white text-left shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.1),0_24px_60px_-30px_rgb(0_0_0/0.25)]"
    >
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-2.5">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-full bg-black/10" />
          ))}
        </span>
        <span className="ml-2 flex items-center gap-1.5 text-[12px] font-medium">
          <ClyroMark className="h-4 w-4" />
          clyro
        </span>
        <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-graphite">
          Exemplo
        </span>
      </div>

      <div className="grid md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden border-r border-black/[0.06] bg-paper/60 p-3 text-[13px] md:block">
          {SIDEBAR.map((s) => (
            <p
              key={s.label}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                s.active ? "bg-black/[0.05] font-medium" : "text-graphite",
              )}
            >
              <s.icon size={15} color="currentColor" />
              {s.label}
              {s.badge && (
                <span className="ml-auto rounded-full bg-brand px-1.5 text-[10px] font-semibold leading-4 text-white">
                  {s.badge}
                </span>
              )}
            </p>
          ))}
          <p className="mb-1 mt-5 px-2 text-[11px] font-medium text-graphite">Workspace</p>
          {["geral", "produto", "design"].map((c) => (
            <p key={c} className="flex items-center gap-2 px-2 py-1 text-graphite">
              <Hashtag size={14} color="currentColor" />
              {c}
            </p>
          ))}
        </aside>

        <div className="min-w-0 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-paper">
              <Mascot pose="estrela" size={32} />
            </span>
            <div className="min-w-0">
              <p className="text-[22px] font-bold leading-tight tracking-[-0.03em]">
                Projeto de SaaS
              </p>
              <p className="text-[13px] text-graphite">MVP · procura Dev, Design e Marketing</p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-1 border-b border-black/[0.06] pb-2 text-[12px]">
            {[
              { icon: People, label: "Pedidos", on: true },
              { icon: Element3, label: "Equipes" },
              { icon: Hashtag, label: "Canais" },
            ].map((t) => (
              <span
                key={t.label}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1",
                  t.on ? "bg-black/[0.05] font-medium" : "text-graphite",
                )}
              >
                <t.icon size={13} color="currentColor" />
                {t.label}
              </span>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {BOARD.map((col, c) => (
              <div key={col.title} className={cn("min-w-0", c > 0 && "hidden sm:block")}>
                <p className="mb-2 flex items-center gap-2 text-[12px]">
                  <span
                    className="rounded-full px-2 py-0.5 font-medium"
                    style={{ background: col.tone, color: col.ink }}
                  >
                    {col.title}
                  </span>
                  <span className="text-graphite">{col.tickets.length}</span>
                </p>
                <div className="space-y-2">
                  {col.tickets.map((t, i) => (
                    <div
                      key={t.role}
                      className="board-card rounded-lg bg-white p-2.5 shadow-[0_0_0_1px_rgb(0_0_0/0.08)]"
                      style={{ "--d": `${900 + c * 160 + i * 90}ms` } as React.CSSProperties}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper">
                          <Mascot pose={t.pose} size={17} />
                        </span>
                        <span className="truncate text-[12.5px] font-medium">{t.role}</span>
                        {c === 2 && (
                          <TickCircle
                            size={14}
                            variant="Bold"
                            color="#1f9d55"
                            className="ml-auto shrink-0"
                          />
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-[12px] text-graphite">{t.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Blocos de recurso: texto de um lado, painel de post-it do outro.     */
/* ------------------------------------------------------------------ */

function SectionTitle({
  id,
  children,
  className,
}: {
  id?: string | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "text-balance text-[clamp(2.1rem,4.6vw,3.4rem)] font-bold leading-[1.04] tracking-[-0.035em]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function Lede({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-serif text-[19px] leading-[1.55] text-graphite", className)}>
      {children}
    </p>
  );
}

/** Cabeçalho das seções da vitrine: título à esquerda, apoio ou ação à direita. */
export function SectionHead({
  title,
  aside,
  action,
  id,
}: {
  title: string;
  aside?: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
      <div className="min-w-0 max-w-[720px]">
        <SectionTitle id={id}>{title}</SectionTitle>
        {aside && <Lede className="mt-3">{aside}</Lede>}
      </div>
      {action}
    </Reveal>
  );
}

type Step = { title: string; body: string };

function FeatureBlock({
  id,
  kicker,
  title,
  lede,
  steps,
  action,
  panel,
  panelColor,
  flip = false,
}: {
  id: string;
  kicker: { pose: MascotPose; label: string; ring: string };
  title: string;
  lede: string;
  steps: Step[];
  action: React.ReactNode;
  panel: React.ReactNode;
  panelColor: string;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={cn(flip && "lg:order-2")}>
        <p className="flex items-center gap-2.5 text-[15px] font-semibold">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white"
            style={{ boxShadow: `0 0 0 2px ${kicker.ring}` }}
          >
            <Mascot pose={kicker.pose} size={24} />
          </span>
          {kicker.label}
        </p>
        <SectionTitle id={id} className="mt-5">
          {title}
        </SectionTitle>
        <Lede className="mt-4 max-w-[46ch]">{lede}</Lede>
        <ol className="mt-7 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[12px] font-semibold tabular-nums shadow-[0_0_0_1px_rgb(0_0_0/0.08)]">
                {i + 1}
              </span>
              <div>
                <p className="text-[16px] font-semibold tracking-[-0.01em]">{s.title}</p>
                <p className="mt-0.5 max-w-[46ch] text-[15px] leading-[1.5] text-graphite">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8">{action}</div>
      </Reveal>
      <Reveal
        i={1}
        className={cn(
          "relative flex min-h-[380px] items-center justify-center overflow-hidden rounded-xl px-6 py-12 sm:px-12",
          flip && "lg:order-1",
        )}
        style={{ background: panelColor }}
      >
        <div className="w-full max-w-[420px] -rotate-1 transition-transform duration-500 ease-out hover:rotate-0">
          {panel}
        </div>
      </Reveal>
    </div>
  );
}

export function TwoSides({
  onPublish,
  onJoin,
  signedIn,
  empty,
  innerRef,
  publishLabel,
}: {
  publishLabel?: string | undefined;
  onPublish: () => void;
  onJoin: () => void;
  signedIn: boolean;
  empty: boolean;
  innerRef?: React.Ref<HTMLElement> | undefined;
}) {
  return (
    <section ref={innerRef} aria-label="Como funciona" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 sm:px-6 lg:gap-32">
        <FeatureBlock
          id="quem-publica"
          kicker={{ pose: "estrela", label: "Para quem tem um projeto", ring: "#ffb110" }}
          title="Publique. Receba pedidos. Escolha quem entra."
          lede="Conte o que você está construindo e quem procura. Quem se interessa responde às suas perguntas, e a decisão é sempre sua."
          steps={[
            { title: "Publique o projeto", body: "Fase, área e as funções que faltam no time." },
            { title: "Leia os pedidos", body: "Perfil e respostas de cada pessoa, lado a lado." },
            {
              title: "Aprove e comece",
              body: "Quem você aprova já entra no workspace do projeto.",
            },
          ]}
          action={
            <button type="button" onClick={onPublish} className={buttonPrimary("h-10")}>
              {publishLabel ?? (empty ? "Publicar o primeiro projeto" : "Publicar projeto")}
            </button>
          }
          panel={<RequestPreview />}
          panelColor="var(--marigold)"
        />
        <FeatureBlock
          flip
          id="quem-procura"
          kicker={{ pose: "brincando", label: "Para quem quer entrar num time", ring: "#62aef0" }}
          title="Ache um projeto. Responda. Comece."
          lede="Dev, design, produto, marketing ou mentoria: veja quem está procurando o que você sabe fazer e peça para entrar."
          steps={[
            { title: "Crie seu perfil", body: "É o que o dono do projeto vai ler primeiro." },
            { title: "Peça para entrar", body: "Responda às perguntas do projeto e envie." },
            {
              title: "Trabalhe junto",
              body: "Aprovado, você entra nas equipes e salas, sem trocar de app.",
            },
          ]}
          action={
            <button type="button" onClick={onJoin} className={buttonGhost("h-10")}>
              {signedIn ? "Abrir meu perfil" : "Criar minha conta"}
            </button>
          }
          panel={<EntryFormPreview />}
          panelColor="var(--sky)"
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* O workspace: cartão escuro grande em cima, dois cartões embaixo.     */
/* ------------------------------------------------------------------ */

export function Workspace() {
  return (
    <section aria-labelledby="workspace" className="py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <SectionTitle id="workspace">Achou o time? Ele já trabalha aqui.</SectionTitle>
          <Lede className="mx-auto mt-4 max-w-[52ch] text-balance">
            A página onde você descobre um projeto vira a sala onde o time trabalha. Depois do sim,
            ninguém precisa trocar de app.
          </Lede>
        </Reveal>

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          <Reveal className="grid overflow-hidden rounded-xl bg-midnight text-white lg:col-span-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
            <div className="flex flex-col justify-between gap-10 p-6 sm:p-10">
              <div>
                <h3 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em]">
                  Quem decide é o dono
                </h3>
                <p className="mt-3 max-w-[40ch] text-[15px] leading-[1.55] text-white/70">
                  Ninguém entra sozinho por um link. Cada pedido passa por quem publicou o projeto,
                  e quem é aprovado chega direto nas equipes e canais.
                </p>
              </div>
              <DecisionLog />
            </div>
            <div className="flex items-end bg-white/[0.04] px-6 pt-8 sm:px-10 sm:pt-10">
              <WorkspacePreview />
            </div>
          </Reveal>

          <Reveal i={1} className="hairline-card flex flex-col overflow-hidden">
            <div className="flex flex-1 items-center bg-paper/70 px-6 py-8 sm:px-10">
              <div className="w-full">
                <CallPreview />
              </div>
            </div>
            <div className="p-6 sm:px-10 sm:py-7">
              <h3 className="text-[22px] font-bold tracking-[-0.02em]">Voz, vídeo e tela</h3>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-graphite">
                Reunião do time sem link de fora: entra na sala, liga a câmera, mostra a tela.
              </p>
            </div>
          </Reveal>

          <Reveal i={2} className="flex flex-col overflow-hidden rounded-xl bg-peach">
            <div className="flex flex-1 items-center px-6 py-10 sm:px-10">
              <RolesPreview />
            </div>
            <div className="p-6 sm:px-10 sm:py-7">
              <h3 className="text-[22px] font-bold tracking-[-0.02em]">
                Onze funções, de cofounder a beta tester
              </h3>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-[#5b4636]">
                Cada projeto diz quem procura. Você vê na hora se tem vaga para o que sabe fazer.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Fechamento e rodapé.                                                 */
/* ------------------------------------------------------------------ */

export function Closing({
  onPublish,
  onJoin,
  publishLabel = "Publicar projeto",
}: {
  onPublish: () => void;
  onJoin: () => void;
  publishLabel?: string;
}) {
  return (
    <section aria-labelledby="fechamento" className="relative overflow-hidden py-24 lg:py-32">
      <MarkBadge pose="energia" ring="#ffb110" doodle="sparkle" className="left-[12%] top-24" />
      <MarkBadge
        pose="sorte"
        ring="#62aef0"
        doodle="squiggle"
        className="bottom-24 right-[12%]"
        delay={120}
      />
      <Reveal className="relative mx-auto flex max-w-[900px] flex-col items-center px-4 text-center sm:px-6">
        <h2
          id="fechamento"
          className="text-balance text-[clamp(2.4rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.045em]"
        >
          Seu próximo time começa com um pedido.
        </h2>
        <Lede className="mt-5 max-w-[44ch]">
          Publique o que você está construindo, ou peça para entrar no que alguém já começou.
        </Lede>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <button
            type="button"
            onClick={onPublish}
            className={buttonPrimary("h-11 px-5 text-[15px]")}
          >
            {publishLabel}
          </button>
          <button type="button" onClick={onJoin} className={buttonGhost("h-11 px-5 text-[15px]")}>
            Quero entrar num time
          </button>
        </div>
      </Reveal>
    </section>
  );
}

export function NotebookFooter({
  onPublish,
  onCategory,
  publishLabel = "Publicar projeto",
}: {
  onPublish: () => void;
  onCategory: (id: string) => void;
  publishLabel?: string;
}) {
  const link =
    "w-fit text-left text-[14px] text-graphite transition-colors duration-200 hover:text-foreground";
  return (
    <footer className="border-t border-black/[0.06]">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <span className="flex items-center gap-2">
            <ClyroMark className="h-8 w-8" />
            <span className="text-xl font-bold tracking-[-0.04em]">clyro</span>
          </span>
          <p className="max-w-[30ch] font-serif text-[16px] leading-[1.5] text-graphite">
            Onde startups e comunidades encontram o seu time.
          </p>
        </div>
        <FooterColumn label="Plataforma">
          <Link to="/" className={link}>
            Descobrir
          </Link>
          <button type="button" onClick={onPublish} className={link}>
            {publishLabel}
          </button>
          <Link to="/app" className={link}>
            Minhas comunidades
          </Link>
        </FooterColumn>
        <FooterColumn label="Categorias">
          {CATEGORIES.slice(0, 5).map((c) => (
            <button key={c.id} type="button" onClick={() => onCategory(c.id)} className={link}>
              {c.label}
            </button>
          ))}
        </FooterColumn>
        <FooterColumn label="Conta">
          <Link to="/auth" className={link}>
            Entrar
          </Link>
          <Link to="/app" className={link}>
            Seu perfil
          </Link>
        </FooterColumn>
      </div>
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 border-t border-black/[0.06] px-4 py-5 text-[13px] text-graphite sm:px-6">
        <span>© {new Date().getFullYear()} clyro</span>
        <Mascot pose="neutro" size={22} />
      </div>
    </footer>
  );
}

function FooterColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="mb-1 text-[14px] font-semibold">{label}</p>
      {children}
    </div>
  );
}
