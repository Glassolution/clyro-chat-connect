import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Headphones,
  LayoutGrid,
  MessagesSquare,
  MonitorUp,
  Timer,
  UserPlus,
  Users,
  Workflow,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ClyroMark } from "@/components/clyro/primitives";
import { Reveal } from "@/components/clyro/reveal";
import { Mascot, type MascotPose } from "./mascot";

/**
 * Landing do Clyro para founders. Mesmo idioma visual do app: fundo gelo,
 * cartões brancos de canto largo, ação em preto, azul só no destaque.
 */
export function FounderLanding({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="min-h-screen bg-card text-foreground">
      <Nav signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <Features />
        <Steps />
        <Cta signedIn={signedIn} />
      </main>
      <Footer />
    </div>
  );
}

function PrimaryCta({ signedIn, label }: { signedIn: boolean; label?: string }) {
  return (
    <Button asChild className="h-14 rounded-2xl px-7 text-base">
      <Link to={signedIn ? "/app" : "/auth"}>
        {signedIn ? "Abrir meu workspace" : (label ?? "Criar meu workspace")}
        <ArrowRight size={18} />
      </Link>
    </Button>
  );
}

function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-card/80 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-6xl items-center gap-8 px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <ClyroMark className="h-10 w-10" />
          <span className="text-lg font-bold tracking-tight">Clyro</span>
        </Link>
        <nav className="hidden items-center gap-7 text-[15px] text-muted-foreground md:flex">
          <a href="#recursos" className="transition-colors hover:text-foreground">
            Recursos
          </a>
          <a href="#como-funciona" className="transition-colors hover:text-foreground">
            Como funciona
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {!signedIn && (
            <Button asChild variant="ghost" className="h-11 rounded-2xl px-5">
              <Link to="/auth">Entrar</Link>
            </Button>
          )}
          <Button asChild className="h-11 rounded-2xl px-5">
            <Link to={signedIn ? "/app" : "/auth"}>{signedIn ? "Abrir o app" : "Começar"}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-14 text-center sm:px-8 sm:pt-20">
        <span className="clyro-enter inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-card">
          <span className="h-2 w-2 rounded-full bg-online" />
          Feito para founders e times pequenos
        </span>
        <h1 className="clyro-enter mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6.4vw,5rem)] font-bold leading-[0.98] tracking-[-0.045em]">
          O workspace da sua startup.
          <span className="block text-muted-foreground">Time, salas e o dia de cada um.</span>
        </h1>
        <p className="clyro-enter mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Chame a equipe por email, separe em times, converse por voz e veja quem está fazendo o quê
          agora — sem cinco ferramentas abertas.
        </p>
        <div className="clyro-enter mt-9 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta signedIn={signedIn} />
          <Button asChild variant="outline" className="h-14 rounded-2xl px-7 text-base">
            <a href="#recursos">Ver o que dá para fazer</a>
          </Button>
        </div>

        <Reveal variant="scale" className="relative mx-auto mt-16 max-w-5xl">
          <Mascot
            pose="estrela"
            size={140}
            float
            className="absolute -left-16 -top-20 z-10 hidden sm:block"
          />
          <Mascot
            pose="brincando"
            size={150}
            float
            className="absolute -bottom-14 -right-6 z-10 hidden sm:block"
          />
          <ProductMock />
        </Reveal>
      </div>
    </section>
  );
}

/** Maquete do painel, no mesmo desenho do app de verdade. */
function ProductMock() {
  const people = [
    { name: "Ana Costa", team: "Produto", status: "Em call · Daily", busy: true },
    { name: "Léo Martins", team: "Engenharia", status: "Revisando o deploy", busy: true },
    { name: "Bia Rocha", team: "Growth", status: "Online", busy: false },
    { name: "Caio Lima", team: "Engenharia", status: "Ausente há 12 min", busy: false },
  ];
  const tones = [
    "oklch(0.93 0.035 262)",
    "oklch(0.95 0.05 60)",
    "oklch(0.95 0.05 155)",
    "oklch(0.94 0.05 300)",
  ];
  const workspaces = ["Acme Labs", "Side project", "Mentoria"];

  return (
    <div className="flex overflow-hidden rounded-[36px] border border-border bg-card text-left shadow-[0_40px_80px_-40px_oklch(0.2_0.02_264/0.35)]">
      <div className="hidden w-[84px] shrink-0 flex-col items-center gap-5 border-r border-border py-6 sm:flex">
        <ClyroMark className="h-10 w-10" />
        {[LayoutGrid, CalendarCheck, MessagesSquare, Users].map((Icon, i) => (
          <span
            key={i}
            className={
              i === 0
                ? "flex h-14 w-14 items-center justify-center rounded-[18px] border border-border shadow-card"
                : "flex h-14 w-14 items-center justify-center text-foreground/70"
            }
          >
            <Icon size={20} />
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1 p-5 sm:p-7">
        <div className="flex gap-2 overflow-hidden">
          {workspaces.map((w, i) => (
            <span
              key={w}
              data-active={i === 0}
              className="ws-pill h-11 shrink-0 gap-2 pl-1.5 pr-4 text-sm"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                {w[0]}
              </span>
              {w}
            </span>
          ))}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-[260px_1fr]">
          <div className="flex flex-col items-center rounded-[28px] bg-background p-5">
            <span className="self-start text-sm text-muted-foreground">Olá, Rafa!</span>
            <span className="mt-1 flex h-20 w-20 items-center justify-center rounded-[24px] bg-card shadow-card">
              <Mascot pose="neutro" size={58} />
            </span>
            <p className="mt-3 text-lg font-bold tracking-tight">Acme Labs</p>
            <p className="text-sm text-muted-foreground">8 pessoas no time</p>
            <div className="mt-4 grid w-full grid-cols-2 gap-2">
              <span className="flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground">
                Convidar
              </span>
              <span className="flex h-10 items-center justify-center rounded-xl bg-card text-sm font-medium shadow-card">
                Salas
              </span>
            </div>
            <div className="mt-4 flex w-full items-center justify-center gap-5 text-center">
              <span>
                <b className="block">5</b>
                <span className="text-xs text-muted-foreground">Online</span>
              </span>
              <span className="h-7 w-px bg-foreground/70" />
              <span>
                <b className="block">3</b>
                <span className="text-xs text-muted-foreground">Equipes</span>
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex gap-2">
              <span className="flex h-10 items-center rounded-xl bg-brand px-5 text-sm font-medium text-white">
                Agora
              </span>
              <span className="flex h-10 items-center rounded-xl bg-card px-5 text-sm shadow-card">
                Equipes
              </span>
              <span className="hidden h-10 items-center rounded-xl bg-card px-5 text-sm shadow-card sm:flex">
                Convites
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {people.map((p, i) => (
                <div key={p.name} className="ws-card space-y-3 p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                      style={{ background: tones[i] }}
                    >
                      {p.name[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.team}</span>
                    </span>
                  </div>
                  <span
                    className={
                      p.busy
                        ? "flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-xs text-brand-strong"
                        : "flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        p.status.startsWith("Ausente")
                          ? "h-2 w-2 rounded-full bg-idle"
                          : "h-2 w-2 rounded-full bg-online"
                      }
                    />
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FEATURES: {
  icon: typeof Users;
  title: string;
  body: string;
  pose?: MascotPose;
  soon?: boolean;
}[] = [
  {
    icon: UserPlus,
    title: "Workspace e convites",
    body: "Crie o workspace da startup e chame o time por email ou @usuário. Quem ainda não tem conta recebe o convite ao entrar.",
    pose: "energia",
  },
  {
    icon: Users,
    title: "Equipes",
    body: "Produto, engenharia, vendas: separe o time, defina admins e veja quem cuida do quê.",
  },
  {
    icon: LayoutGrid,
    title: "Quem está fazendo o quê",
    body: "O painel mostra quem está online, em call ou ausente — e o que cada um está tocando agora.",
  },
  {
    icon: Headphones,
    title: "Salas de voz e reuniões",
    body: "Daily, alinhamentos e reuniões em salas de voz com vídeo, filtro de ruído e áudio em alta fidelidade.",
    pose: "chuva",
  },
  {
    icon: MonitorUp,
    title: "Tela compartilhada nítida",
    body: "Até 4K a 60 fps, com o bitrate acompanhando a escolha — texto legível do outro lado.",
  },
  {
    icon: MessagesSquare,
    title: "Chat por sala e direto",
    body: "Canais por assunto e mensagens diretas, no mesmo lugar das chamadas.",
  },
  {
    icon: CalendarCheck,
    title: "Tasks da equipe",
    body: "Distribua o trabalho do dia e acompanhe o que travou, por pessoa ou por equipe.",
    soon: true,
  },
  {
    icon: Timer,
    title: "Tempo ativo",
    body: "Check-in, check-out e há quanto tempo cada um está ativo no Clyro hoje.",
    soon: true,
  },
  {
    icon: Workflow,
    title: "Workflows",
    body: "Modelos prontos — daily, retro, onboarding de contratado — ou monte o seu.",
    soon: true,
  },
];

function Features() {
  return (
    <section id="recursos" className="scroll-mt-24 bg-background py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.035em]">
            Tudo que um time pequeno precisa para andar junto.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Comunidade e ferramenta no mesmo lugar: conversa, voz e a operação do dia a dia.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 80}>
              <div className="ws-card relative flex h-full flex-col gap-4 overflow-hidden p-7 clyro-lift">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
                    <f.icon size={22} />
                  </span>
                  {f.soon ? (
                    <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">
                      Em breve
                    </span>
                  ) : (
                    f.pose && <Mascot pose={f.pose} size={60} className="-my-2" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    {
      pose: "neutro" as const,
      title: "Crie o workspace",
      body: "Escolha um modelo — startup, agência ou em branco — e ele já nasce com salas e equipes.",
    },
    {
      pose: "sorte" as const,
      title: "Chame o time",
      body: "Convide por email ou @usuário e coloque cada pessoa direto na equipe certa.",
    },
    {
      pose: "estrela" as const,
      title: "Toque o dia",
      body: "Veja quem está ativo, entre na daily com um clique e converse por sala ou direto.",
    },
  ];
  return (
    <section id="como-funciona" className="scroll-mt-24 py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="text-center">
          <h2 className="text-[clamp(2rem,4vw,3rem)] font-bold tracking-[-0.035em]">
            Em três passos.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 100}>
              <div className="flex flex-col items-center rounded-[32px] bg-background px-7 pb-8 pt-6 text-center">
                <Mascot pose={s.pose} size={120} />
                <span className="mt-2 text-sm font-semibold text-muted-foreground">
                  Passo {i + 1}
                </span>
                <h3 className="mt-1 text-xl font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <Reveal variant="scale">
        <div className="relative mx-auto flex max-w-6xl flex-col items-center overflow-hidden rounded-[40px] bg-primary px-6 py-20 text-center text-primary-foreground">
          <Mascot
            pose="energia"
            size={130}
            float
            className="absolute -left-4 bottom-6 hidden md:block"
          />
          <Mascot
            pose="sorte"
            size={130}
            float
            className="absolute -right-2 top-8 hidden md:block"
          />
          <h2 className="max-w-2xl text-[clamp(2rem,4.4vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.035em]">
            Seu time inteiro, num lugar só.
          </h2>
          <p className="mt-4 max-w-md text-lg text-primary-foreground/70">
            De graça enquanto estamos em beta. Cria em um minuto.
          </p>
          <Button
            asChild
            variant="secondary"
            className="mt-9 h-14 rounded-2xl bg-card px-7 text-base text-foreground hover:bg-card/90"
          >
            <Link to={signedIn ? "/app" : "/auth"}>
              {signedIn ? "Abrir meu workspace" : "Criar meu workspace"}
              <ArrowRight size={18} />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8">
        <span className="flex items-center gap-2 text-foreground">
          <ClyroMark className="h-6 w-6 text-foreground" glyphClassName="text-card" />
          <b className="font-bold">Clyro</b>
        </span>
        <span>O workspace da sua startup.</span>
        <span className="ml-auto">© {new Date().getFullYear()} Clyro</span>
      </div>
    </footer>
  );
}
