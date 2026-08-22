import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LandingBenefits,
  LandingCta,
  LandingFeatures,
  LandingFooter,
  LandingHero,
  LandingNav,
} from "@/components/clyro/landing";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clyro — converse do seu jeito" },
      {
        name: "description",
        content:
          "O Clyro reúne servidores, canais de texto, salas de voz sempre abertas e chamadas com vídeo e compartilhamento de tela em uma interface minimalista em preto e branco.",
      },
      { property: "og:title", content: "Clyro — converse do seu jeito" },
      {
        property: "og:description",
        content:
          "Servidores, canais de texto, salas de voz sempre abertas e chamadas com vídeo — tudo em preto e branco.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user } = useAuth();
  const signedIn = Boolean(user);

  return (
    <div className="min-h-screen bg-surface">
      <LandingNav signedIn={signedIn} />
      <main>
        <LandingHero signedIn={signedIn} />
        <LandingFeatures />
        <LandingBenefits />
        <LandingCta signedIn={signedIn} />
      </main>
      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
