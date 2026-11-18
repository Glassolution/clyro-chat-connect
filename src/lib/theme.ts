import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Tema do workspace: claro, escuro ou o do sistema. A escolha fica salva no
 * navegador e vale só dentro do app (`/app`); a vitrine pública e o login
 * continuam no claro em que foram desenhados.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "clyro.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* sem armazenamento: segue o sistema */
  }
  return "system";
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia(DARK_QUERY);
  // Outra aba trocou o tema, ou o sistema virou noite.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) onChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** "escolha:resolvido" numa string só, para o useSyncExternalStore comparar. */
function snapshot() {
  const choice = readChoice();
  const resolved = choice === "system" ? (systemPrefersDark() ? "dark" : "light") : choice;
  return `${choice}:${resolved}`;
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* sem armazenamento: vale só para esta visita */
  }
  listeners.forEach((notify) => notify());
}

export function useTheme() {
  const value = useSyncExternalStore(subscribe, snapshot, () => "system:light");
  const [choice, resolved] = value.split(":") as [ThemeChoice, ResolvedTheme];
  const setChoice = useCallback((next: ThemeChoice) => setThemeChoice(next), []);
  return { choice, resolved, setChoice };
}

/**
 * Põe o tema no <html> enquanto o app está montado — assim os portais (menus,
 * diálogos, toasts) herdam as mesmas cores — e tira ao sair do app.
 */
export function useApplyTheme() {
  const { resolved } = useTheme();
  useEffect(() => {
    // Lê o valor real em vez do da hidratação, que sempre diz "claro" e faria
    // a tela piscar branca antes de escurecer.
    const current = snapshot().split(":")[1] as ResolvedTheme;
    const root = document.documentElement;
    root.classList.toggle("dark", current === "dark");
    root.style.colorScheme = current;
  }, [resolved]);
  useEffect(
    () => () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    },
    [],
  );
}

/**
 * Roda antes do primeiro quadro, no <head>: sem ele o app carrega branco e só
 * depois escurece. Só age dentro de /app.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{if(!location.pathname.startsWith("/app"))return;var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||((!t||t==="system")&&matchMedia("${DARK_QUERY}").matches);if(d){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`;
