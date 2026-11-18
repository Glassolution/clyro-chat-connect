import { useEffect, useState } from "react";
import { isDesktopApp } from "./desktop";

/**
 * Downloads do app de computador. Os instaladores ficam na última versão
 * publicada no GitHub do Clyro (pasta `desktop/`, `npm run dist:mac` e
 * `npm run dist:win`): o link aponta sempre para a mais recente.
 */
const RELEASES = "https://github.com/Glassolution/clyro-chat-connect/releases/latest/download";

export type DesktopOs = "mac" | "windows";

export const DESKTOP_DOWNLOADS: Record<DesktopOs, { label: string; url: string }> = {
  mac: { label: "Mac", url: `${RELEASES}/Clyro-mac.dmg` },
  windows: { label: "Windows", url: `${RELEASES}/Clyro-windows-x64.exe` },
};

/** O sistema de quem abriu o site, quando há app para ele. Celular e Linux ficam de fora. */
export function detectDesktopOs(): DesktopOs | null {
  if (typeof navigator === "undefined") return null;
  const hinted = (
    navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
  ).userAgentData;
  if (hinted?.mobile) return null;
  const platform = (hinted?.platform || navigator.platform || "").toLowerCase();
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod|android/.test(ua)) return null;
  if (platform.includes("mac") || ua.includes("mac os x")) {
    // iPad se apresenta como Mac; a tela de toque denuncia (Mac não tem).
    return navigator.maxTouchPoints > 1 ? null : "mac";
  }
  if (platform.includes("win") || ua.includes("windows")) return "windows";
  return null;
}

/**
 * O download certo para este computador, ou nada: no celular, no Linux e
 * dentro do próprio app não há o que oferecer. Lido depois de montar, para o
 * HTML do servidor e o da página baterem.
 */
export function useDesktopDownload() {
  const [os, setOs] = useState<DesktopOs | null>(null);
  useEffect(() => {
    setOs(isDesktopApp() ? null : detectDesktopOs());
  }, []);
  return os ? { os, ...DESKTOP_DOWNLOADS[os] } : null;
}
