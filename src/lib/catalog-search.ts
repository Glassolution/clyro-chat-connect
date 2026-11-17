/** Filtros do catálogo, guardados na URL de /buscar. */
export type CatalogSearch = {
  q?: string;
  categoria?: string;
  fase?: string;
  funcao?: string;
};

export const CATALOG_KEYS = ["q", "categoria", "fase", "funcao"] as const;

/** Endereço do catálogo com os filtros, para levar junto pelo login. */
export function catalogHref(search: CatalogSearch) {
  const params = new URLSearchParams();
  CATALOG_KEYS.forEach((k) => {
    const v = search[k];
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return qs ? `/buscar?${qs}` : "/buscar";
}

/** Junta uma mudança aos filtros atuais, sem deixar chave vazia. */
export function mergeCatalogSearch(
  prev: CatalogSearch,
  patch: { [K in keyof CatalogSearch]?: string | undefined },
): CatalogSearch {
  const out: CatalogSearch = {};
  CATALOG_KEYS.forEach((k) => {
    const v = k in patch ? patch[k] : prev[k];
    if (v) out[k] = v;
  });
  return out;
}
