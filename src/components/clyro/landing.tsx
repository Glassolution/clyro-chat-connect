import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  Hash,
  Headphones,
  Link2,
  Menu,
  MessageSquare,
  Mic,
  MonitorUp,
  ShieldCheck,
  Users,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClyroMark, ClyroWordmark } from "@/components/clyro/primitives";
import { Reveal } from "@/components/clyro/reveal";

const NAV_LINKS = [
  { href: "#servidores", label: "Servidores" },
  { href: "#voz", label: "Voz" },
  { href: "#video", label: "Vídeo" },
  { href: "#recursos", label: "Recursos" },
];

/* ------------------------------------------------------------------- nav */

export function LandingNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5">
        <Link to="/" className="shrink-0">
          <ClyroWordmark />
        </Link>

        <ul className="hidden flex-1 items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button asChild size="sm" className="rounded-full px-4">
            <Link to={signedIn ? "/app" : "/auth"}>{signedIn ? "Abrir o Clyro" : "Entrar"}</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </nav>

      {open && (
        <ul className="border-t border-border bg-panel px-5 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                onClick={() => setOpen(false)}
                className="block py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

export function LandingHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-stage">
      <BackdropGlow />
      <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 text-center sm:pt-24">
        <span className="clyro-enter inline-flex items-center gap-2 rounded-full border border-border bg-panel/70 px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-online" />
          Voz, vídeo e tela compartilhada sem instalar nada
        </span>

        <h1
          className="clyro-enter mx-auto mt-6 max-w-3xl text-balance text-5xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl md:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          Um lugar só para a sua turma conversar
        </h1>

        <p
          className="clyro-enter mx-auto mt-6 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
          style={{ animationDelay: "160ms" }}
        >
          O Clyro reúne servidores, canais de texto, salas de voz sempre abertas e chamadas com
          vídeo em uma interface minimalista em preto e branco. Entre, fale, saia — sem ruído.
        </p>

        <div
          className="clyro-enter mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <Button
            asChild
            size="lg"
            className="w-full rounded-full transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            <Link to={signedIn ? "/app" : "/auth"}>
              {signedIn ? "Abrir o Clyro" : "Criar conta grátis"}
              <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full rounded-full transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            <Link to="/app">Abrir no navegador</Link>
          </Button>
        </div>

        <div className="clyro-enter mt-16" style={{ animationDelay: "340ms" }}>
          <AppMockup />
        </div>
      </div>
    </section>
  );
}

function BackdropGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-[-18rem] h-[36rem] w-[52rem] -translate-x-1/2 rounded-full bg-foreground/[0.07] blur-3xl" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at 50% 0%, black 10%, transparent 65%)",
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- app mockup */

const MOCK_MESSAGES = [
  { author: "Ana", initials: "AN", text: "subiu a build nova, alguém testa o canal de voz?" },
  { author: "Rafa", initials: "RA", text: "entrando agora — me chama que eu compartilho a tela" },
  { author: "Duda", initials: "DU", text: "áudio limpo aqui, sem eco" },
];

function AppMockup() {
  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-panel text-left shadow-float">
      <div className="flex h-9 items-center gap-2 border-b border-border bg-rail px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/15" />
        <span className="ml-3 text-[11px] text-muted-foreground">clyro.app / estúdio</span>
      </div>

      <div className="flex h-[360px] sm:h-[420px]">
        {/* rail de servidores */}
        <div className="hidden w-[68px] shrink-0 flex-col items-center gap-3 border-r border-border bg-rail py-4 sm:flex">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
            <ClyroMark className="h-5 w-5 text-primary-foreground" glyphClassName="text-primary" />
          </span>
          <span className="h-px w-8 bg-border" />
          {["ES", "DV", "LO"].map((server, i) => (
            <span
              key={server}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-xs font-medium text-secondary-foreground",
                i === 0 && "ring-2 ring-foreground",
              )}
            >
              {server}
            </span>
          ))}
        </div>

        {/* sidebar de canais */}
        <div className="hidden w-52 shrink-0 flex-col border-r border-border bg-sidebar sm:flex">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Estúdio</div>
          <div className="flex-1 space-y-1 p-2">
            <ChannelLabel>Texto</ChannelLabel>
            <ChannelRow icon={Hash} label="geral" active />
            <ChannelRow icon={Hash} label="releases" />
            <ChannelLabel>Voz</ChannelLabel>
            <ChannelRow icon={Volume2} label="sala principal" />
            <div className="space-y-1 pl-7 pt-1">
              {["Ana", "Rafa"].map((name) => (
                <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Initials label={name} className="h-5 w-5 text-[9px]" />
                  {name}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <Initials label="você" className="h-7 w-7 text-[10px]" />
            <span className="text-xs">você</span>
            <Mic className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            <Headphones className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* chat */}
        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">geral</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              12
            </span>
          </div>
          <div className="flex-1 space-y-4 overflow-hidden p-4">
            {MOCK_MESSAGES.map((message) => (
              <div key={message.author} className="flex gap-3">
                <Initials label={message.initials} className="h-8 w-8 text-[11px]" />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{message.author}</span>
                    <span className="text-[10px] text-muted-foreground">agora</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{message.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3">
            <div className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
              Mensagem em #geral
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

/* -------------------------------------------------------------- features */

export function LandingFeatures() {
  return (
    <>
      <FeatureRow
        id="servidores"
        eyebrow="Servidores"
        title="Um espaço por turma, organizado em canais"
        body="Crie um servidor para o time, para a família ou para a jogatina de sexta. Dentro dele, canais de texto separam cada assunto e todo mundo acha o que precisa sem rolar mil mensagens."
        visual={<ServersVisual />}
      />
      <FeatureRow
        id="voz"
        eyebrow="Voz"
        title="Salas de voz que ficam sempre abertas"
        body="Entre num canal de voz com um clique e comece a falar. Sem agendar, sem link, sem sala de espera — quem está online aparece na lista e entra junto quando quiser."
        visual={<VoiceVisual />}
        reversed
      />
      <FeatureRow
        id="video"
        eyebrow="Vídeo e tela"
        title="Mostre a tela sem trocar de aplicativo"
        body="Ligue a câmera ou compartilhe a tela direto da sala de voz. Revisar um design, acompanhar um deploy ou assistir algo junto acontece no mesmo lugar da conversa."
        visual={<VideoVisual />}
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
    <section id={id} className="border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-2 md:gap-16">
        <Reveal className={cn(reversed && "md:order-2")}>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">{body}</p>
        </Reveal>
        <Reveal className={cn(reversed && "md:order-1")} delay={120}>
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

function VisualFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-panel p-5 shadow-panel transition-colors hover:border-foreground/20">
      {children}
    </div>
  );
}

function ServersVisual() {
  return (
    <VisualFrame>
      <div className="grid grid-cols-4 gap-3">
        {["ES", "DV", "LO", "FM", "JG", "UX", "QA", "+"].map((server, i) => (
          <span
            key={server}
            className={cn(
              "flex aspect-square items-center justify-center rounded-2xl bg-secondary text-sm font-medium text-secondary-foreground",
              i === 0 && "bg-primary text-primary-foreground",
            )}
          >
            {server}
          </span>
        ))}
      </div>
      <div className="mt-5 space-y-1.5">
        <ChannelRow icon={Hash} label="geral" active />
        <ChannelRow icon={Hash} label="avisos" />
        <ChannelRow icon={Hash} label="links-uteis" />
      </div>
    </VisualFrame>
  );
}

const VOICE_PEOPLE = [
  { name: "Ana", speaking: true },
  { name: "Rafa", speaking: false },
  { name: "Duda", speaking: true },
  { name: "Iris", speaking: false },
];

function VoiceVisual() {
  return (
    <VisualFrame>
      <div className="flex items-center gap-2 pb-4 text-sm">
        <Volume2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">sala principal</span>
        <span className="ml-auto text-xs text-muted-foreground">4 na chamada</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {VOICE_PEOPLE.map((person) => (
          <div
            key={person.name}
            className="flex flex-col items-center gap-2 rounded-xl bg-stage py-6 text-stage-foreground"
          >
            <Initials
              label={person.name}
              className={cn("h-12 w-12 text-sm", person.speaking && "speaking-ring")}
            />
            <span className="text-xs text-muted-foreground">{person.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <PillIcon icon={Mic} />
        <PillIcon icon={Headphones} />
        <PillIcon icon={Video} />
        <PillIcon icon={MonitorUp} />
      </div>
    </VisualFrame>
  );
}

function VideoVisual() {
  return (
    <VisualFrame>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-stage">
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground">
          <MonitorUp className="h-5 w-5" />
          <span className="text-sm">Rafa está compartilhando a tela</span>
        </div>
        <div className="absolute bottom-3 right-3 flex gap-2">
          {["AN", "DU"].map((initials) => (
            <span
              key={initials}
              className="flex h-12 w-16 items-center justify-center rounded-lg border border-border bg-panel text-xs font-medium"
            >
              {initials}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <PillIcon icon={Mic} />
        <PillIcon icon={Video} />
        <PillIcon icon={MonitorUp} />
      </div>
    </VisualFrame>
  );
}

function PillIcon({ icon: Icon }: { icon: typeof Mic }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      <Icon className="h-4 w-4" />
    </span>
  );
}

/* ------------------------------------------------------------ benefícios */

const BENEFITS = [
  {
    icon: MessageSquare,
    title: "Mensagens diretas",
    body: "Converse a sós ou em grupo fora dos servidores, com o mesmo histórico e os mesmos atalhos.",
  },
  {
    icon: ShieldCheck,
    title: "Papéis e permissões",
    body: "Defina quem administra, quem fala e quem só acompanha em cada canal do servidor.",
  },
  {
    icon: Bell,
    title: "Presença em tempo real",
    body: "Veja quem está online, ausente ou ocupado antes de chamar — e quem já está na voz.",
  },
  {
    icon: Link2,
    title: "Convite por link",
    body: "Chame gente nova com um link. Sem cadastro complicado, sem espera por aprovação.",
  },
];

export function LandingBenefits() {
  return (
    <section id="recursos" className="border-b border-border bg-panel/40">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Feito para grupos de qualquer tamanho
          </h2>
          <p className="mt-4 text-muted-foreground">
            Dos três amigos que jogam à noite ao time inteiro de produto — as mesmas ferramentas,
            sem plano pago no meio do caminho.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((benefit, index) => (
            <Reveal key={benefit.title} delay={index * 80}>
              <div className="h-full rounded-2xl border border-border bg-card p-6 transition-colors hover:border-foreground/25">
                <benefit.icon className="h-5 w-5" />
                <h3 className="mt-4 font-medium">{benefit.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{benefit.body}</p>
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
    <section className="relative overflow-hidden border-b border-border bg-stage">
      <BackdropGlow />
      <Reveal className="relative mx-auto max-w-3xl px-5 py-24 text-center">
        <ClyroMark className="mx-auto h-10 w-10" />
        <h2 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Sua turma já pode estar conversando
        </h2>
        <p className="mt-4 text-pretty text-muted-foreground">
          Crie um servidor em menos de um minuto e mande o link. O resto acontece sozinho.
        </p>
        <Button
          asChild
          size="lg"
          className="mt-8 rounded-full transition-transform hover:-translate-y-0.5"
        >
          <Link to={signedIn ? "/app" : "/auth"}>
            {signedIn ? "Abrir o Clyro" : "Criar conta grátis"}
            <ArrowRight />
          </Link>
        </Button>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

const FOOTER_COLUMNS = [
  {
    title: "Produto",
    links: [
      { label: "Servidores", href: "#servidores" },
      { label: "Voz", href: "#voz" },
      { label: "Vídeo e tela", href: "#video" },
      { label: "Recursos", href: "#recursos" },
    ],
  },
  {
    title: "Comunidade",
    links: [
      { label: "Central de ajuda", href: "#recursos" },
      { label: "Diretrizes", href: "#recursos" },
      { label: "Status", href: "#recursos" },
      { label: "Novidades", href: "#recursos" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Sobre", href: "#recursos" },
      { label: "Marca", href: "#recursos" },
      { label: "Carreiras", href: "#recursos" },
      { label: "Contato", href: "#recursos" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Termos de uso", href: "#recursos" },
      { label: "Privacidade", href: "#recursos" },
      { label: "Cookies", href: "#recursos" },
      { label: "Segurança", href: "#recursos" },
    ],
  },
];

export function LandingFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div>
            <ClyroWordmark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Conversas, voz e vídeo em tempo real — em preto e branco.
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
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Clyro. Todos os direitos reservados.
          </span>
          <Button asChild size="sm" className="rounded-full sm:ml-auto">
            <Link to={signedIn ? "/app" : "/auth"}>{signedIn ? "Abrir o Clyro" : "Entrar"}</Link>
          </Button>
        </div>
      </div>
    </footer>
  );
}
