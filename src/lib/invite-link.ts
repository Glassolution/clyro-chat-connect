/**
 * O link de convite de um workspace. Quem abre o link (já logado, ou depois de
 * entrar) vira membro na hora, sem pedido para aprovar.
 *
 * O domínio vem de `VITE_SITE_URL` quando definido (por exemplo, um domínio
 * próprio no futuro). Sem ele, vale o endereço onde o app está aberto — na
 * Vercel, o domínio da Vercel.
 */
export function siteUrl() {
  const configured = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function inviteLink(code: string) {
  return `${siteUrl()}/convite/${encodeURIComponent(code)}`;
}
