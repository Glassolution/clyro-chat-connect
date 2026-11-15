import { createFileRoute } from "@tanstack/react-router";
import { DiscoverHome } from "@/components/discover/discover-home";

export const Route = createFileRoute("/")({
  ssr: false,
  // `?publicar=1` reabre o formulário de publicação depois do login.
  validateSearch: (search: Record<string, unknown>): { publicar?: true } =>
    search["publicar"] === 1 || search["publicar"] === "1" || search["publicar"] === true
      ? { publicar: true }
      : {},
  head: () => ({
    meta: [
      { title: "Clyro — startups procurando gente" },
      {
        name: "description",
        content:
          "Encontre startups e comunidades que estão montando o time. Peça para entrar, ou publique o seu projeto e escolha quem entra.",
      },
      { property: "og:title", content: "Clyro — startups procurando gente" },
      {
        property: "og:description",
        content: "Publique o seu projeto, receba pedidos e toque junto com o time.",
      },
    ],
  }),
  component: DiscoverHome,
});
