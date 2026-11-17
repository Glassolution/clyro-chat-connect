import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { saveWorkspace } from "@/lib/workspace-memory";
import { ClyroMark } from "@/components/clyro/primitives";
import { Mascot } from "@/components/workspace/mascot";

/**
 * O link de convite: /convite/<código>. Quem abre já logado entra no workspace
 * na hora e cai dentro dele; quem não tem conta passa pelo login e volta para
 * cá, e aí entra. Sem pedido para aprovar: o link é o aceite.
 */
export const Route = createFileRoute("/convite/$code")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Convite para um workspace — Clyro" },
      {
        name: "description",
        content: "Você foi convidado para um workspace no Clyro. Abra o link para entrar no time.",
      },
      { property: "og:title", content: "Você foi convidado para um workspace no Clyro" },
      {
        property: "og:description",
        content: "Abra o link para entrar no time: chat, salas de voz e quem faz o quê.",
      },
    ],
  }),
  component: InvitePage,
});

type Status = "joining" | "invalid" | "error";

function InvitePage() {
  const { code } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("joining");
  const started = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth", search: { next: `/convite/${code}` }, replace: true });
      return;
    }
    // O efeito pode rodar duas vezes em desenvolvimento: entra uma vez só.
    if (started.current) return;
    started.current = true;

    void (async () => {
      const { data, error } = await supabase.rpc("join_server_by_invite", { _code: code });
      if (error) {
        setStatus("error");
        return;
      }
      if (!data) {
        setStatus("invalid");
        return;
      }
      // O /app abre no último workspace lembrado: este.
      saveWorkspace(data);
      await qc.invalidateQueries({ queryKey: ["servers", user.id] });
      toast.success("Pronto, você entrou no workspace.");
      void navigate({ to: "/app", replace: true });
    })();
  }, [loading, user, code, navigate, qc]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#f5f5f5] px-4 py-10">
      <Link
        to="/"
        aria-label="Clyro"
        className="mb-8 flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ClyroMark className="h-8 w-8" />
        <span className="text-[17px] font-semibold tracking-[-0.03em]">clyro</span>
      </Link>

      <section className="clyro-in-rise flex w-full max-w-[380px] flex-col items-center rounded-[28px] bg-card px-6 pb-7 pt-8 text-center shadow-[0_0_0_1px_rgb(0_0_0/0.04),0_20px_50px_-30px_rgb(0_0_0/0.3)]">
        {status === "joining" ? (
          <>
            <Mascot pose="energia" size={84} className="animate-pulse" />
            <h1 className="mt-4 text-[19px] font-semibold tracking-[-0.02em]">
              Entrando no workspace
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
              Você foi convidado. Em um instante você está dentro, com o time.
            </p>
          </>
        ) : (
          <>
            <Mascot pose="chuva" size={84} />
            <h1 className="mt-4 text-[19px] font-semibold tracking-[-0.02em]">
              {status === "invalid" ? "Esse convite não vale mais" : "Não deu para entrar agora"}
            </h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
              {status === "invalid"
                ? "O link pode ter sido trocado ou o workspace não existe mais. Peça um link novo para quem te convidou."
                : "A conexão falhou no meio do caminho. Tente abrir o link de novo."}
            </p>
            <div className="mt-5 flex w-full flex-col gap-2">
              {status === "error" && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="h-11 rounded-full bg-foreground text-[14px] font-medium text-background transition-[transform,background-color] duration-150 ease-clyro hover:bg-foreground/90 active:scale-[0.98]"
                >
                  Tentar de novo
                </button>
              )}
              <Link
                to="/"
                className="flex h-11 items-center justify-center rounded-full border border-black/[0.08] text-[14px] font-medium transition-colors hover:bg-[#fafafa]"
              >
                Ver as startups no Clyro
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
