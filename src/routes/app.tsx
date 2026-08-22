import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ClyroApp } from "@/components/clyro/app";
import { ClyroWordmark } from "@/components/clyro/primitives";

export const Route = createFileRoute("/app")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clyro — conversas, voz e vídeo em tempo real" },
      {
        name: "description",
        content:
          "Clyro reúne servidores, canais de texto e voz, mensagens diretas e chamadas com vídeo e compartilhamento de tela em uma interface minimalista.",
      },
      { property: "og:title", content: "Clyro — conversas, voz e vídeo em tempo real" },
      {
        property: "og:description",
        content:
          "Servidores, canais, DMs e chamadas com vídeo e compartilhamento de tela em uma interface minimalista.",
      },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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
