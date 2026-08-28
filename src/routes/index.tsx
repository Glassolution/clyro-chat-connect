import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LandingBenefits,
  LandingCta,
  LandingFeatures,
  LandingFlow,
  LandingFooter,
  LandingHero,
  LandingNav,
  LandingShowcase,
} from "@/components/clyro/landing";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Clyro — where every project finds its community" },
      {
        name: "description",
        content:
          "Clyro gives your project a public home: post updates, share videos and behind-the-scenes of what you are building, and follow the discussion of the people who use it.",
      },
      { property: "og:title", content: "Clyro — where every project finds its community" },
      {
        property: "og:description",
        content:
          "A public space for every project: updates, videos, inline comments and community.",
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
        <LandingShowcase />
        <LandingFlow />
        <LandingFeatures />
        <LandingBenefits />
        <LandingCta signedIn={signedIn} />
      </main>
      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
