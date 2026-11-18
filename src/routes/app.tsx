import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ClyroApp } from "@/components/clyro/app";
import { ClyroWordmark } from "@/components/clyro/primitives";
import { useApplyTheme } from "@/lib/theme";

export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clyro — o workspace da sua startup" },
      {
        name: "description",
        content:
          "Workspace para founders: equipe, convites, salas de chat e reuniões por voz e o dia a dia de quem faz o quê.",
      },
      { property: "og:title", content: "Clyro — o workspace da sua startup" },
      {
        property: "og:description",
        content: "Equipe, salas de chat, reuniões por voz e o dia a dia de quem faz o quê.",
      },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // Aqui e não dentro do app: cobre a tela de carregamento e sai junto com a
  // rota, inclusive quando quem não entrou é mandado para o login.
  useApplyTheme();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <ClyroWordmark className="animate-pulse" />
      </div>
    );
  }

  return <ClyroApp />;
}
