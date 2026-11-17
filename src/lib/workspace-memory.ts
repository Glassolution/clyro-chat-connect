/** Último workspace aberto: o /app abre nele. Compartilhado com a home. */
export const WORKSPACE_KEY = "clyro:workspace";

export function readSavedWorkspace() {
  try {
    return window.localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function saveWorkspace(id: string) {
  try {
    window.localStorage.setItem(WORKSPACE_KEY, id);
  } catch {
    /* navegador sem armazenamento: só não lembra o último workspace */
  }
}
