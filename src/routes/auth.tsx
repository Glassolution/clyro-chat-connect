import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { ClyroWordmark } from "@/components/clyro/primitives";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar no Clyro" },
      {
        name: "description",
        content: "Crie sua conta Clyro ou entre para acessar seus servidores, DMs e chamadas.",
      },
      { property: "og:title", content: "Entrar no Clyro" },
      {
        property: "og:description",
        content: "Crie sua conta Clyro ou entre para acessar seus servidores, DMs e chamadas.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
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
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/app`,
    });
    if (result.error) toast.error("Não foi possível entrar com o Google.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-panel">
        <ClyroWordmark className="mb-1" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Converse do seu jeito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Servidores, canais de voz e chamadas — tudo em preto e branco.
        </p>

        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Entrar
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Criar conta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-3 pt-5">
            <Field id="email" label="E-mail" value={email} onChange={setEmail} type="email" />
            <Field
              id="password"
              label="Senha"
              value={password}
              onChange={setPassword}
              type="password"
            />
            <Button className="w-full" onClick={() => void signIn()} disabled={busy}>
              Entrar
            </Button>
          </TabsContent>

          <TabsContent value="signup" className="space-y-3 pt-5">
            <Field id="username" label="Nome de usuário" value={username} onChange={setUsername} />
            <Field id="email-up" label="E-mail" value={email} onChange={setEmail} type="email" />
            <Field
              id="password-up"
              label="Senha"
              value={password}
              onChange={setPassword}
              type="password"
            />
            <Button className="w-full" onClick={() => void signUp()} disabled={busy}>
              Criar conta
            </Button>
          </TabsContent>
        </Tabs>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" className="w-full" onClick={() => void google()}>
          Continuar com Google
        </Button>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
