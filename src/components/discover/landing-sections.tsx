import { useEffect, useRef, useState } from "react";
import { Reveal, useInView, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { Link } from "@tanstack/react-router";
import {
  DocumentText1,
  Hashtag,
  Microphone2,
  Monitor,
  Profile2User,
  TickCircle,
  Video,
  VolumeHigh,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, ROLES } from "@/lib/project-queries";
import { ClyroMark } from "@/components/clyro/primitives";
import { Mascot, type MascotPose } from "@/components/workspace/mascot";
import { buttonGhost, buttonPrimary } from "./site-nav";

/*
 * O resto da landing em papel branco: cartões de linha fina, títulos leves e
 * apertados, telas do próprio produto como prova. O laranja do mascote é a
 * única cor, e aparece só onde há uma ação ou um "sim".
 */

/** Título de seção à esquerda; à direita, uma frase de apoio ou uma ação. */
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
    <Reveal className="mb-10 grid items-end gap-x-12 gap-y-4 md:mb-12 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <h2
        id={id}
        className="whitespace-pre-line text-balance text-[clamp(2rem,4.4vw,3.25rem)] font-[460] leading-[1.04] tracking-[-0.04em]"
      >
        {title}
      </h2>
      {(aside || action) && (
        <div className="flex items-end justify-between gap-6 md:justify-end">
          {aside && <p className="max-w-[44ch] text-[15px] leading-[1.55] text-ink-2">{aside}</p>}
          {action}
        </div>
      )}
    </Reveal>
  );
}

/** Seção com o respiro padrão da página: 96px no celular, 128px no desktop. */
export function Band({
  children,
  className,
  labelledBy,
  innerRef,
}: {
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
  innerRef?: React.Ref<HTMLElement> | undefined;
}) {
  return (
    <section
      ref={innerRef}
      aria-labelledby={labelledBy}
      className={cn("scroll-mt-20 py-24 lg:py-32", className)}
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Como funciona: os dois lados, cada um com a tela que vai usar.       */
/* ------------------------------------------------------------------ */

type Track = {
  title: string;
  lede: string;
  steps: { title: string; body: string }[];
};

const FOUNDER: Track = {
  title: "Tenho um projeto",
  lede: "Para quem está montando o time de uma startup ou de uma comunidade.",
  steps: [
    {
      title: "Publique o projeto",
      body: "Conte o que está construindo, em que fase está e quem você procura.",
    },
    {
      title: "Receba os pedidos",
      body: "Quem se interessa responde às suas perguntas. Você vê o perfil e decide.",
    },
    {
      title: "Trabalhe com o time",
      body: "Quem você aprova entra direto no workspace: equipes, chat, voz e vídeo.",
    },
  ],
};

const SEEKER: Track = {
  title: "Quero entrar num time",
  lede: "Para quem quer construir algo com outras pessoas: dev, design, produto e mais.",
  steps: [
    {
      title: "Crie seu perfil",
      body: "Diga o que você sabe fazer. É o que o dono do projeto vai ver.",
    },
    {
      title: "Peça para entrar",
      body: "Achou um projeto que te anima? Responda às perguntas dele e envie.",
    },
    {
      title: "Comece no workspace",
      body: "Aprovado, você já entra nas equipes e salas do projeto, sem trocar de app.",
    },
  ],
};

export function HowItWorks({
  onPublish,
  onJoin,
  signedIn,
  empty,
  innerRef,
}: {
  onPublish: () => void;
  onJoin: () => void;
  signedIn: boolean;
  /** Vitrine vazia: o botão de quem publica convida a ser o primeiro. */
  empty: boolean;
  innerRef?: React.Ref<HTMLElement> | undefined;
}) {
  return (
    <Band labelledBy="como-funciona" innerRef={innerRef}>
      <SectionHead
        id="como-funciona"
        title="Do projeto ao time, pelos dois lados"
        aside="Quem publica e quem procura seguem o mesmo caminho: um pedido, uma decisão do dono, e o time já está trabalhando."
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
        <TrackCard
          index={0}
          track={FOUNDER}
          preview={<RequestPreview />}
          action={
            <button type="button" onClick={onPublish} className={buttonPrimary("h-10")}>
              {empty ? "Publicar o primeiro projeto" : "Publicar projeto"}
            </button>
          }
        />
        <TrackCard
          index={1}
          track={SEEKER}
          preview={<EntryFormPreview />}
          action={
            <button type="button" onClick={onJoin} className={buttonGhost("h-10")}>
              {signedIn ? "Abrir meu perfil" : "Criar minha conta"}
            </button>
          }
        />
      </div>
    </Band>
  );
}

function TrackCard({
  track,
  preview,
  action,
  index,
}: {
  index: number;
  track: Track;
  preview: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <Reveal
      as="article"
      i={index}
      className="hairline-card flex flex-col overflow-hidden lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-0"
    >
      {/* Subgrid: as duas telas ocupam a mesma altura, e os títulos se alinham. */}
      <div className="flex items-end border-b border-black/[0.06] bg-surface-1 px-5 pb-0 pt-6 sm:px-8 sm:pt-8">
        <div className="w-full">{preview}</div>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-8">
        <h3 className="text-[26px] font-[460] leading-[1.15] tracking-[-0.035em]">{track.title}</h3>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-[1.55] text-ink-2">{track.lede}</p>
        <ol className="mt-6 flex-1">
          {track.steps.map((step, i) => (
            <li
              key={step.title}
              className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-t border-black/[0.06] py-3.5"
            >
              <span className="pt-[3px] font-mono text-[12px] tabular-nums text-muted-foreground">
                {i + 1}/3
              </span>
              <div>
                <p className="text-[15px] font-medium tracking-[-0.015em]">{step.title}</p>
                <p className="mt-0.5 max-w-[50ch] text-sm leading-[1.55] text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5">{action}</div>
      </div>
    </Reveal>
  );
}

/** Janela do produto: barra fina com o nome da tela e o conteúdo embaixo. */
function Window({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-t-md bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_16px_32px_-24px_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-2.5">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-edge" />
          ))}
        </span>
        <span className="ml-1 truncate text-[12px] font-medium tracking-[-0.01em]">{title}</span>
        {meta && (
          <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Roda uma pequena história uma vez, quando a prévia aparece na tela: cada
 * número é quanto esperar (ms) antes de passar para a próxima fase.
 */
function useStory(waits: number[]) {
  const [ref, seen] = useInView<HTMLDivElement>({ once: true, threshold: 0.6 });
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!seen || phase >= waits.length) return;
    const t = window.setTimeout(() => setPhase((p) => p + 1), waits[phase]);
    return () => window.clearTimeout(t);
  }, [seen, phase, waits]);
  return [ref, phase] as const;
}

const REQUEST_STORY = [1100, 160];

/** O que o dono vê: um pedido com a função, a resposta e as duas decisões. */
function RequestPreview() {
  // 0: novo · 1: o dono aperta "Aprovar" · 2: aprovado.
  const [ref, phase] = useStory(REQUEST_STORY);
  const approved = phase >= 2;
  return (
    <div ref={ref}>
      <Window title="Pedidos de acesso" meta={approved ? "1 aprovado" : "1 novo"}>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Mascot pose="brincando" size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">Pedido para Design</p>
              <p className="truncate text-[12px] text-muted-foreground">
                {approved ? "Já está no workspace" : "Perfil e respostas abaixo"}
              </p>
            </div>
            <span
              key={approved ? "ok" : "novo"}
              className={cn(
                "word-in shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                approved ? "bg-brand-soft text-foreground" : "bg-surface-2 text-ink-2",
              )}
            >
              {approved ? "No time" : "Novo"}
            </span>
          </div>
          <div className="mt-3 rounded-md bg-surface-1 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">Por que este projeto?</p>
            <p className="mt-1 text-[13px] leading-[1.5]">
              Quero desenhar o onboarding desde a primeira versão.
            </p>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <span
              className={cn(
                "flex h-8 items-center rounded-md px-3 text-[12px] font-medium shadow-[0_0_0_1px_var(--edge-strong)] transition-opacity duration-300",
                approved && "opacity-40",
              )}
            >
              Recusar
            </span>
            <span
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-[transform,background-color,color,box-shadow] duration-200 ease-clyro",
                phase === 1 && "scale-[0.94]",
                approved
                  ? "bg-white text-foreground shadow-[0_0_0_1px_var(--brand)]"
                  : "bg-brand text-white",
              )}
            >
              <TickCircle
                size={14}
                color="currentColor"
                variant={approved ? "Bold" : "Linear"}
                className={approved ? "text-brand" : undefined}
              />
              {approved ? "Aprovado" : "Aprovar"}
            </span>
          </div>
        </div>
      </Window>
    </div>
  );
}

const ANSWER = "Front-end em React e um pouco de design";

/** O que quem procura vê: o projeto, as vagas e o formulário de entrada. */
function EntryFormPreview() {
  const reduced = usePrefersReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>({ once: true, threshold: 0.6 });
  const [typed, setTyped] = useState(0);
  const [sent, setSent] = useState<0 | 1 | 2>(0);

  // Digita a resposta, espera um instante, aperta "Enviar pedido".
  useEffect(() => {
    if (!seen) return undefined;
    if (typed < ANSWER.length) {
      const t = window.setTimeout(
        () => setTyped(reduced ? ANSWER.length : typed + 1),
        typed === 0 ? 500 : 34,
      );
      return () => window.clearTimeout(t);
    }
    if (sent < 2) {
      const t = window.setTimeout(() => setSent((v) => (v + 1) as 1 | 2), sent === 0 ? 700 : 160);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [seen, typed, sent, reduced]);

  const done = sent === 2;
  return (
    <div ref={ref}>
      <Window title="Formulário de entrada" meta={done ? "enviado" : "2 perguntas"}>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
              <Mascot pose="energia" size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">Projeto de SaaS</p>
              <p className="truncate text-[12px] text-muted-foreground">Procura Dev e Design</p>
            </div>
            <span className="shrink-0 rounded-[4px] bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
              MVP
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <div
              className={cn(
                "rounded-md p-2.5 transition-shadow duration-300",
                seen && !done
                  ? "shadow-[0_0_0_1px_var(--brand),0_0_0_3px_var(--brand-soft)]"
                  : "shadow-[0_0_0_1px_var(--edge)]",
              )}
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                O que você sabe fazer?
              </p>
              <p className="mt-0.5 min-h-[19.5px] text-[13px]">
                {ANSWER.slice(0, typed)}
                {!done && (
                  <span className="caret-blink ml-px inline-block h-[13px] w-px translate-y-[2px] bg-brand" />
                )}
              </p>
            </div>
            <div className="rounded-md p-2.5 shadow-[0_0_0_1px_var(--edge)]">
              <p className="text-[11px] font-medium text-muted-foreground">
                Quantas horas por semana?
              </p>
              <p className="mt-0.5 h-[18px] text-[13px]">{done ? "10 a 15" : ""}</p>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <span
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-[transform,background-color,color,box-shadow] duration-200 ease-clyro",
                sent === 1 && "scale-[0.94]",
                done
                  ? "bg-white text-foreground shadow-[0_0_0_1px_var(--brand)]"
                  : "bg-brand text-white",
              )}
            >
              {done && (
                <TickCircle size={14} color="currentColor" variant="Bold" className="text-brand" />
              )}
              {done ? "Pedido enviado" : "Enviar pedido"}
            </span>
          </div>
        </div>
      </Window>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Achou o time, ele já trabalha aqui: o workspace em quatro cartões.   */
/* ------------------------------------------------------------------ */

export function OneJourney() {
  return (
    <Band labelledBy="mesmo-lugar" className="border-t border-black/[0.06]">
      <SectionHead
        id="mesmo-lugar"
        title={"Achou o time?\nEle já trabalha aqui"}
        aside="A página onde você descobre um projeto vira a sala onde o time trabalha. Depois do sim, ninguém precisa trocar de app."
      />
      <div className="grid gap-4 lg:grid-cols-6">
        <FeatureCard
          i={0}
          className="lg:col-span-4"
          title="Equipes, canais e mensagens"
          body="Cada projeto ganha um workspace com equipes, canais de texto e salas de voz, montado pelo dono."
        >
          <WorkspacePreview />
        </FeatureCard>
        <DecisionCard className="lg:col-span-2" />
        <FeatureCard
          i={2}
          className="lg:col-span-3"
          title="Voz, vídeo e tela compartilhada"
          body="Reuniões do time sem link de fora: entra na sala, liga a câmera, mostra a tela."
        >
          <CallPreview />
        </FeatureCard>
        <FeatureCard
          i={3}
          className="lg:col-span-3"
          title={`${ROLES.length} funções, de cofounder a beta tester`}
          body="Cada projeto diz quem procura. Você vê na hora se tem vaga para o que sabe fazer."
          centered
        >
          <RolesPreview />
        </FeatureCard>
      </div>
    </Band>
  );
}

function FeatureCard({
  title,
  body,
  children,
  className,
  centered = false,
  i = 0,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
  /** Prévia que não é janela: fica no meio do painel, não presa embaixo. */
  centered?: boolean;
  i?: number;
}) {
  return (
    <Reveal
      as="article"
      i={i}
      className={cn("hairline-card flex flex-col overflow-hidden", className)}
    >
      <div
        className={cn(
          "flex flex-1 bg-surface-1 px-5 sm:px-8",
          centered ? "items-center py-8" : "items-end pt-6 sm:pt-8",
        )}
      >
        <div className="w-full">{children}</div>
      </div>
      <div className="border-t border-black/[0.06] p-5 sm:px-8 sm:py-6">
        <h3 className="text-[19px] font-[480] tracking-[-0.025em]">{title}</h3>
        <p className="mt-1.5 max-w-[56ch] text-sm leading-[1.55] text-ink-2">{body}</p>
      </div>
    </Reveal>
  );
}

const CHANNELS: { name: string; active?: boolean }[] = [
  { name: "geral", active: true },
  { name: "produto" },
  { name: "design" },
];

const MESSAGES: { pose: MascotPose; who: string; text: string }[] = [
  {
    pose: "estrela",
    who: "Dono do projeto",
    text: "Bem-vindo ao time! O roadmap está fixado aqui no #geral.",
  },
  { pose: "brincando", who: "Você", text: "Valeu! Já li. Posso pegar a tela de cadastro?" },
];

function WorkspacePreview() {
  return (
    <Window title="Projeto de SaaS" meta="workspace" className="overflow-hidden">
      <div className="grid sm:grid-cols-[180px_minmax(0,1fr)]">
        {/* No celular só a conversa: a lista de canais não cabe ao lado. */}
        <div className="hidden border-r border-black/[0.06] bg-surface-1 p-3 text-[12px] sm:block">
          <p className="px-1.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
            Texto
          </p>
          {CHANNELS.map((c) => (
            <p
              key={c.name}
              className={cn(
                "flex items-center gap-1.5 rounded-[4px] px-1.5 py-1",
                c.active ? "bg-white font-medium shadow-[0_0_0_1px_rgb(0_0_0/0.06)]" : "text-ink-2",
              )}
            >
              <Hashtag size={12} color="currentColor" />
              {c.name}
            </p>
          ))}
          <p className="mt-3 px-1.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
            Voz
          </p>
          <p className="flex items-center gap-1.5 px-1.5 py-1 text-ink-2">
            <VolumeHigh size={12} color="currentColor" />
            Daily
          </p>
          <div className="flex gap-1 pl-6 pt-1">
            {(["neutro", "energia", "sorte"] as MascotPose[]).map((p) => (
              <span
                key={p}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
              >
                <Mascot pose={p} size={14} />
              </span>
            ))}
          </div>
        </div>
        <div className="flex min-h-[200px] flex-col p-4">
          <p className="flex items-center gap-1 text-[13px] font-medium">
            <Hashtag size={13} color="currentColor" />
            geral
          </p>
          <div className="mt-3 flex-1 space-y-3">
            {MESSAGES.map((m) => (
              <div key={m.text} className="flex gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <Mascot pose={m.pose} size={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium">{m.who}</p>
                  <p className="text-[12.5px] leading-[1.45] text-ink-2">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex h-8 items-center rounded-md px-2.5 text-[12px] text-muted-foreground shadow-[0_0_0_1px_var(--edge)]">
            Mensagem em #geral
          </div>
        </div>
      </div>
    </Window>
  );
}

function CallPreview() {
  // O anel de quem fala só pulsa enquanto a prévia está na tela.
  const [ref, live] = useInView<HTMLDivElement>({ threshold: 0.1 });
  return (
    <div ref={ref} data-inview={live}>
      <Window title="Daily" meta="sala de voz">
        <div className="grid grid-cols-2 gap-2 p-3">
          {(
            [
              { pose: "neutro", speaking: true },
              { pose: "energia", speaking: false },
            ] as { pose: MascotPose; speaking: boolean }[]
          ).map((t) => (
            <div
              key={t.pose}
              className={cn(
                "flex h-[132px] items-center justify-center rounded-md bg-surface-1",
                t.speaking && "speaking-brand",
              )}
            >
              <Mascot pose={t.pose} size={48} />
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2 border-t border-black/[0.06] p-2.5">
          {[Microphone2, Video, Monitor].map((Icon, i) => (
            <span
              key={i}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                i === 2 ? "bg-foreground text-background" : "bg-surface-2 text-foreground",
              )}
            >
              <Icon size={15} color="currentColor" />
            </span>
          ))}
        </div>
      </Window>
    </div>
  );
}

function RolesPreview() {
  const wanted = new Set(["Dev", "Design", "Produto"]);
  return (
    <div aria-hidden="true" className="flex flex-wrap justify-center gap-2">
      {ROLES.map((r) => (
        <span
          key={r}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium shadow-[0_0_0_1px_rgb(0_0_0/0.08)]",
            wanted.has(r) ? "text-foreground shadow-[0_0_0_1px_var(--brand)]" : "text-ink-2",
          )}
        >
          {wanted.has(r) && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
          {r}
        </span>
      ))}
    </div>
  );
}

/**
 * O cartão escuro da página: o caminho de um pedido até o "sim". As linhas
 * entram uma depois da outra quando o cartão aparece na tela — o único
 * movimento autoral da landing.
 */
const LOG: { icon: typeof DocumentText1; text: string; done?: boolean }[] = [
  { icon: DocumentText1, text: "Pedido recebido" },
  { icon: Profile2User, text: "Perfil e respostas revisados" },
  { icon: TickCircle, text: "Aprovado: entrou no workspace", done: true },
];

function DecisionCard({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || played) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPlayed(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [played]);

  return (
    <Reveal i={1} className={cn("flex", className)}>
      <article
        ref={ref}
        data-played={played}
        className="flex w-full flex-col justify-between gap-10 rounded-md bg-[#171717] p-5 text-white sm:p-8"
      >
        <ol aria-label="Caminho de um pedido" className="space-y-px">
          {LOG.map((l, i) => (
            <li
              key={l.text}
              style={{ "--i": i } as React.CSSProperties}
              className="log-line flex items-center gap-3 border-b border-white/10 py-3 font-mono text-[12px] tracking-[0.02em]"
            >
              <l.icon
                size={16}
                color="currentColor"
                variant={l.done ? "Bold" : "Linear"}
                className={l.done ? "text-brand" : "text-white/60"}
              />
              <span className={l.done ? "text-white" : "text-white/75"}>{l.text}</span>
            </li>
          ))}
        </ol>
        <div>
          <Mascot pose="estrela" size={44} className="mb-4" />
          <h3 className="text-[24px] font-[460] leading-[1.15] tracking-[-0.035em]">
            Quem decide é o dono
          </h3>
          <p className="mt-2 text-sm leading-[1.55] text-white/70">
            Ninguém entra sozinho por um link. Cada pedido passa por quem publicou o projeto.
          </p>
        </div>
      </article>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* Fechamento e rodapé.                                                 */
/* ------------------------------------------------------------------ */

export function ClosingCta({
  onPublish,
  onExplore,
}: {
  onPublish: () => void;
  onExplore: () => void;
}) {
  return (
    <section
      aria-labelledby="fechamento"
      className="relative overflow-hidden border-t border-black/[0.06] bg-white"
    >
      <div className="blueprint-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_80%_at_50%_50%,transparent_20%,black_90%)]" />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-4 py-24 text-center sm:px-6 lg:py-32">
        <Reveal i={0}>
          <Mascot pose="energia" size={72} className="mascot-float" />
        </Reveal>
        <Reveal as="div" i={1} id="fechamento-titulo" className="mt-6">
          <h2
            id="fechamento"
            className="mx-auto max-w-[16ch] text-balance text-[clamp(2.25rem,5.5vw,4rem)] font-[460] leading-[1.02] tracking-[-0.045em]"
          >
            Seu time está a um pedido de distância
          </h2>
        </Reveal>
        <Reveal i={2} className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onPublish} className={buttonPrimary("h-11 px-5")}>
            Publicar projeto
          </button>
          <button type="button" onClick={onExplore} className={buttonGhost("h-11 px-5")}>
            Quero entrar num time
          </button>
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter({
  onPublish,
  onCategory,
}: {
  onPublish: () => void;
  onCategory: (id: string) => void;
}) {
  const link =
    "w-fit text-left text-sm text-ink-2 underline-offset-4 transition-colors hover:text-foreground hover:underline";
  return (
    <footer className="border-t border-black/[0.06] bg-surface-1">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <span className="flex items-center gap-2">
            <ClyroMark className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-[-0.04em]">clyro</span>
          </span>
          <p className="max-w-[30ch] text-sm leading-[1.55] text-ink-2">
            Onde startups e comunidades encontram o seu time.
          </p>
        </div>
        <FooterColumn label="Plataforma">
          <Link to="/" className={link}>
            Descobrir
          </Link>
          <button type="button" onClick={onPublish} className={link}>
            Publicar projeto
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
      <div className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
            © {new Date().getFullYear()} clyro
          </span>
          <Mascot pose="neutro" size={20} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.07em] text-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
