import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "@/components/icons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { ClyroMark } from "@/components/clyro/primitives";
import { Mascot } from "@/components/workspace/mascot";
import { isDesktopApp } from "@/lib/desktop";

/** Para onde voltar depois de entrar — só caminhos internos. */
function safeNext(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

/** Domínios servidos pelo Lovable, onde o login dele funciona. */
const LOVABLE_HOSTS = ["lovable.app", "lovableproject.com", "lovableproject-dev.com"];

function isLovableHost(host: string) {
  return LOVABLE_HOSTS.some((zone) => host === zone || host.endsWith(`.${zone}`));
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { next?: string } => {
    const next = safeNext(search["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Entrar no Clyro" },
      {
        name: "description",
        content: "Entre no Clyro ou crie sua conta para montar o workspace da sua startup.",
      },
      { property: "og:title", content: "Entrar no Clyro" },
      {
        property: "og:description",
        content: "Entre no Clyro ou crie sua conta para montar o workspace da sua startup.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [desktop] = useState(() => isDesktopApp());

  useEffect(() => {
    if (!loading && user) {
      // `next` pode trazer busca ("/buscar?q=…"): o histórico leva a query inteira.
      if (next) router.history.replace(next);
      else void navigate({ to: "/app" });
    }
  }, [loading, user, navigate, router, next]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const signUp = async () => {
    if (!username.trim()) {
      toast.error("Escolha um nome de usuário.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: {
          username: username.trim().toLowerCase().replace(/\s+/g, ""),
          display_name: username.trim(),
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta criada. Bem-vindo ao Clyro!");
  };

  const google = async () => {
    const redirect = `${window.location.origin}${next ?? "/app"}`;
    // O login do Lovable depende de uma rota que só existe na hospedagem dele
    // (/~oauth). Em qualquer outro domínio, como a Vercel, vai direto pelo
    // Supabase, com o cliente Google configurado no backend.
    if (!isLovableHost(window.location.hostname)) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirect },
      });
      if (error) toast.error("O login com Google ainda não está disponível neste endereço.");
      return;
    }
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirect });
    if (result.error) toast.error("Não foi possível entrar com o Google.");
  };

  const submit = () => void (mode === "signin" ? signIn() : signUp());

  return (
    <main className="flex min-h-screen bg-card text-foreground">
      {/* Formulário */}
      <section className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[52%] lg:px-20">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <ClyroMark className="h-10 w-10" />
            <span className="text-lg font-bold tracking-tight">Clyro</span>
          </Link>
          {/* No aplicativo não há vitrine para voltar. */}
          {!desktop && (
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 clyro-enter">
          {next?.startsWith("/buscar") && (
            <p className="mb-5 flex items-center gap-2.5 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[14px] font-medium text-brand-ink">
              <Mascot pose="estrela" size={24} className="shrink-0" />
              Entre ou crie sua conta para ver o catálogo de projetos.
            </p>
          )}
          <h1 className="text-[clamp(2rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            {mode === "signin" ? "Bom te ver de novo." : "Monte o workspace da sua startup."}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {mode === "signin"
              ? "Seu time, suas salas e o dia de cada um estão te esperando."
              : "Equipe, convites, salas de voz e quem faz o quê — de graça enquanto estamos em beta."}
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={() => void google()}
            className="mt-8 h-14 w-full rounded-2xl border-border text-[15px] font-medium shadow-card"
          >
            <GoogleGlyph />
            Continuar com Google
          </Button>

          <div className="my-6 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            ou com email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {mode === "signup" && (
              <Field
                id="username"
                label="Usuário"
                placeholder="Seu nome de usuário"
                value={username}
                onChange={setUsername}
                autoComplete="username"
              />
            )}
            <Field
              id="email"
              label="Email"
              placeholder="nome@empresa.com"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <Field
              id="password"
              label="Senha"
              placeholder="Sua senha"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />

            <Button type="submit" disabled={busy} className="h-14 w-full rounded-2xl text-[15px]">
              {mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Ainda não tem conta? " : "Já tem conta? "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-foreground underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Criar agora" : "Entrar"}
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Convidado para um workspace? Entre com o mesmo email do convite e ele aparece para você.
        </p>
      </section>

      {/* Vitrine */}
      <aside className="relative hidden flex-1 p-4 lg:flex">
        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-[40px] bg-background px-12">
          <AuthPreview />
        </div>
      </aside>
    </main>
  );
}

/** Um pedaço do painel, com os mascotes em volta, para mostrar o que vem depois do login. */
function AuthPreview() {
  const people = [
    { name: "Ana", role: "Produto", status: "Em call · Daily", tone: "oklch(0.93 0.035 262)" },
    { name: "Léo", role: "Engenharia", status: "Revisando o deploy", tone: "oklch(0.95 0.05 60)" },
    { name: "Bia", role: "Growth", status: "Online", tone: "oklch(0.95 0.05 155)" },
  ];
  return (
    <div className="relative w-full max-w-md">
      <Mascot pose="estrela" size={120} float className="absolute -left-14 -top-20" />
      <Mascot pose="chuva" size={130} float className="absolute -bottom-24 -right-12" />

      <div className="ws-card relative space-y-4 p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Olá, Rafa!</span>
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white">
            Agora
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-background">
            <Mascot pose="neutro" size={48} />
          </span>
          <div>
            <p className="text-xl font-bold tracking-tight">Acme Labs</p>
            <p className="text-sm text-muted-foreground">8 pessoas · 3 equipes</p>
          </div>
        </div>
        <ul className="space-y-2">
          {people.map((p) => (
            <li
              key={p.name}
              className="flex items-center gap-3 rounded-2xl bg-secondary px-3 py-2.5"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                style={{ background: p.tone }}
              >
                {p.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.status}</span>
              </span>
              <span className="text-xs text-muted-foreground">{p.role}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative mt-16 text-center text-2xl font-bold tracking-tight">
        Seu time inteiro, num lugar só.
      </p>
      <p className="relative mt-2 text-center text-[15px] text-muted-foreground">
        Veja quem está online, o que cada um está fazendo e chame para uma sala com um clique.
      </p>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.4 0-.7-.1-1.4-.2-2H12Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 1-3.5 1-2.7 0-5-1.8-5.8-4.2l-3.3 2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#4A90D9" d="M6.2 13.9a6 6 0 0 1 0-3.8L2.9 7.5a10 10 0 0 0 0 9l3.3-2.6Z" />
      <path
        fill="#FBBC05"
        d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 2.9 7.5l3.3 2.6C7 7.6 9.3 5.8 12 5.8Z"
      />
    </svg>
  );
}

function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-14 rounded-2xl border-border bg-background px-5 text-[15px]",
          "focus-visible:bg-card",
        )}
      />
    </div>
  );
}
