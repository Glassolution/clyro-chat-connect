/**
 * O Clyro também roda como aplicativo de computador (pasta `desktop/`, em
 * Electron). O app carrega este mesmo site e o preload dele expõe
 * `window.clyroDesktop`: é por ele que o site sabe que está dentro do app.
 *
 * No app o Clyro fica mais enxuto, como o Discord: login, as comunidades para
 * entrar e o workspace. A vitrine pública e as páginas de marketing ficam no
 * site.
 */

/** Uma tela ou janela que o app pode compartilhar. */
export type DesktopSource = {
  id: string;
  name: string;
  kind: "screen" | "window";
  /** Miniatura em data URL. */
  thumbnail: string;
  /** Ícone do app dono da janela, quando houver. */
  icon: string | null;
};

export type DesktopPickRequest = { requestId: string; sources: DesktopSource[] };

export type DesktopBridge = {
  platform: "darwin" | "win32" | "linux";
  version: string;
  /** O app pede para escolher o que compartilhar; a resposta volta por `answerPick`. */
  onPickSource: (handler: (request: DesktopPickRequest) => void) => () => void;
  answerPick: (requestId: string, sourceId: string | null) => void;
};

declare global {
  interface Window {
    clyroDesktop?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.clyroDesktop ?? null;
}

export function isDesktopApp() {
  return desktopBridge() !== null;
}

/** Caminhos que existem no app. O resto do site leva para o workspace. */
const DESKTOP_PATHS = [
  /^\/auth\/?$/,
  /^\/app\/?$/,
  /^\/buscar\/?$/,
  /^\/p\/[^/]+\/?$/,
  /^\/convite\/[^/]+\/?$/,
];

export function isDesktopPath(pathname: string) {
  return DESKTOP_PATHS.some((re) => re.test(pathname));
}

/** Para o `<html>`: estilos do app (barra de título arrastável). */
export const DESKTOP_BOOT_SCRIPT = `(function(){try{var d=window.clyroDesktop;if(!d)return;var c=document.documentElement.classList;c.add("clyro-desktop");c.add("clyro-desktop-"+d.platform);}catch(e){}})();`;
