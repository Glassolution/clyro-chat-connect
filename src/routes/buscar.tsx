import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/discover/catalog";
import type { CatalogSearch } from "@/lib/catalog-search";

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined;

export const Route = createFileRoute("/buscar")({
  ssr: false,
  // Busca, área, fase e função ficam na URL: dá para voltar, recarregar e compartilhar.
  validateSearch: (search: Record<string, unknown>): CatalogSearch => {
    const out: CatalogSearch = {};
    const q = text(search["q"]);
    const categoria = text(search["categoria"]);
    const fase = text(search["fase"]);
    const funcao = text(search["funcao"]);
    if (q) out.q = q;
    if (categoria) out.categoria = categoria;
    if (fase) out.fase = fase;
    if (funcao) out.funcao = funcao;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Catálogo de projetos — Clyro" },
      {
        name: "description",
        content: "Todos os projetos abertos no Clyro, por área, fase e função procurada.",
      },
    ],
  }),
  component: CatalogPage,
});
