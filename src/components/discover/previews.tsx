import { useEffect, useRef, useState } from "react";
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
import { ROLES } from "@/lib/project-queries";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { Mascot, type MascotPose } from "@/components/workspace/mascot";

/*
 * Telas do próprio Clyro desenhadas em HTML, usadas como prova na landing.
 * Os nomes são genéricos ("Projeto de SaaS", "Pedido para Design") e a barra
 * de cada janela diz que é um exemplo: nada aqui finge ser dado real.
 */

/** Janela do produto: barra fina com o nome da tela e o conteúdo embaixo. */
export function Window({
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
        "overflow-hidden rounded-xl bg-white text-left text-foreground shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.1)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-black/[0.06] px-4 py-2.5">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 rounded-full bg-black/10" />
          ))}
        </span>
        <span className="ml-1 truncate text-[12px] font-medium tracking-[-0.01em]">{title}</span>
        {meta && (
          <span
            key={meta}
            className="word-in ml-auto shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] font-medium text-graphite"
          >
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
export function RequestPreview() {
  // 0: novo · 1: o dono aperta "Aprovar" · 2: aprovado.
  const [ref, phase] = useStory(REQUEST_STORY);
  const approved = phase >= 2;
  return (
    <div ref={ref}>
      <Window title="Pedidos de acesso" meta={approved ? "1 aprovado" : "1 novo"}>
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper">
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
                "word-in shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                approved ? "bg-[#dff3e4] text-[#1f6b35]" : "bg-[#fdecc8] text-[#7a4a00]",
              )}
            >
              {approved ? "No time" : "Novo"}
            </span>
          </div>
          <div className="mt-3 rounded-md bg-paper p-3">
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
export function EntryFormPreview() {
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-paper">
              <Mascot pose="energia" size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">Projeto de SaaS</p>
              <p className="truncate text-[12px] text-muted-foreground">Procura Dev e Design</p>
            </div>
            <span className="shrink-0 rounded-[4px] bg-paper px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-2">
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

export function WorkspacePreview() {
  return (
    <Window title="Projeto de SaaS" meta="workspace" className="overflow-hidden">
      <div className="grid sm:grid-cols-[180px_minmax(0,1fr)]">
        {/* No celular só a conversa: a lista de canais não cabe ao lado. */}
        <div className="hidden border-r border-black/[0.06] bg-paper p-3 text-[12px] sm:block">
          <p className="px-1.5 pb-1.5 text-[11px] font-medium text-graphite">Texto</p>
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
          <p className="mt-3 px-1.5 pb-1.5 text-[11px] font-medium text-graphite">Voz</p>
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-paper">
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

export function CallPreview() {
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
                "flex h-[132px] items-center justify-center rounded-md bg-paper",
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
                i === 2 ? "bg-foreground text-background" : "bg-paper text-foreground",
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

export function RolesPreview() {
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

export function DecisionLog({ className }: { className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
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
    <ol
      ref={ref}
      data-played={played}
      aria-label="Caminho de um pedido"
      className={cn("space-y-px", className)}
    >
      {LOG.map((l, i) => (
        <li
          key={l.text}
          style={{ "--i": i } as React.CSSProperties}
          className="log-line flex items-center gap-3 border-b border-white/10 py-3 text-[14px]"
        >
          <l.icon
            size={18}
            color="currentColor"
            variant={l.done ? "Bold" : "Linear"}
            className={l.done ? "text-marigold" : "text-white/55"}
          />
          <span className={l.done ? "font-medium text-white" : "text-white/75"}>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}
