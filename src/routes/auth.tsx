import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { ClyroMark } from "@/components/clyro/primitives";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in to Clyro" },
      {
        name: "description",
        content:
          "Sign in to Clyro or create your account to publish updates and follow the projects you care about.",
      },
      { property: "og:title", content: "Sign in to Clyro" },
      {
        property: "og:description",
        content:
          "Sign in to Clyro or create your account to publish updates and follow the projects you care about.",
      },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/app" });
  }, [loading, user, navigate]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  const signUp = async () => {
    if (!username.trim()) {
      toast.error("Pick a username first.");
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
    toast.success("Account created. Welcome to Clyro!");
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) toast.error("Could not sign in with Google.");
  };

  const submit = () => void (mode === "signin" ? signIn() : signUp());

  return (
    <main className="clyro-auth-field relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <Orbits />

      <Link
        to="/"
        className="clyro-fade-in absolute left-6 top-6 inline-flex items-center gap-2 text-sm text-white/60 transition-colors duration-200 hover:text-white sm:left-10 sm:top-10"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to clyro.app
      </Link>

      {/*
        Cantos assimétricos como na referência: curva ampla em cima à esquerda e
        embaixo à direita, quase reta nos outros dois.
      */}
      <section className="clyro-glass clyro-enter relative w-full max-w-3xl rounded-bl-xl rounded-br-[3.5rem] rounded-tl-[3.5rem] rounded-tr-xl px-7 py-12 sm:px-12 sm:py-14">
        <ClyroMark className="mx-auto h-10 w-10" />

        <h1 className="mt-6 text-center text-[clamp(1.9rem,3.4vw,2.6rem)] font-light leading-[1.05] tracking-[-0.03em] text-white">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-white/60">
          {mode === "signin"
            ? "Pick up where your community left off."
            : "Claim your space and publish the first update."}
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-0">
          {/* e-mail e senha */}
          <div className="md:pr-10">
            <h2 className="text-center text-sm text-white/70 md:text-left">
              {mode === "signin" ? "Sign in with email" : "Sign up with email"}
            </h2>

            <form
              className="mt-5 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              {mode === "signup" && (
                <Field
                  id="username"
                  label="Username"
                  placeholder="Username"
                  value={username}
                  onChange={setUsername}
                  autoComplete="username"
                />
              )}
              <Field
                id="email"
                label="Email"
                placeholder="Email address"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
              />
              <Field
                id="password"
                label="Password"
                placeholder="Your password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />

              <Button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-strong"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>

          {/* método alternativo */}
          <div className="relative md:pl-10">
            <span
              aria-hidden="true"
              className="absolute -top-5 left-1/2 h-px w-full -translate-x-1/2 bg-white/10 md:left-0 md:top-0 md:h-full md:w-px md:translate-x-0"
            />
            <h2 className="text-center text-sm text-white/70 md:text-left">Or keep it one click</h2>

            <div className="mt-5 flex flex-col items-center gap-5 md:items-start">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void google()}
                className="h-12 w-full rounded-xl border border-white/15 bg-white/[0.06] text-[15px] font-medium text-white hover:bg-white/[0.12] hover:text-white"
              >
                <GoogleGlyph />
                Continue with Google
              </Button>

              <p className="max-w-[15rem] text-center text-[13px] leading-relaxed text-white/55 md:text-left">
                No password to remember. We only read your name and email to set up the account.
              </p>

              <p className="max-w-[15rem] text-center text-[13px] leading-relaxed text-white/40 md:text-left">
                Clyro is free while in open beta — every project space, update and member included.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-11 text-center text-sm text-white/60">
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="cursor-pointer text-white underline-offset-4 transition-opacity duration-200 hover:underline hover:opacity-80"
          >
            {mode === "signin" ? "Register" : "Sign in"}
          </button>
        </p>
      </section>
    </main>
  );
}

/** Órbitas de fundo — duas elipses e dois pontos, como na referência. */
function Orbits() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full text-white/[0.13]"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <ellipse cx="600" cy="350" rx="520" ry="250" transform="rotate(-12 600 350)" />
        <ellipse cx="600" cy="350" rx="430" ry="300" transform="rotate(14 600 350)" />
      </g>
      <circle cx="905" cy="168" r="6" className="fill-white/70" />
      <circle cx="565" cy="629" r="7" className="fill-white/55" />
    </svg>
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
          "h-12 rounded-xl border-white/12 bg-white/[0.05] px-4 text-[15px] text-white",
          "placeholder:text-white/40 focus-visible:border-white/25 focus-visible:ring-brand/40",
        )}
      />
    </div>
  );
}
