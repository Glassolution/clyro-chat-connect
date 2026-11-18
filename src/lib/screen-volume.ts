import { useSyncExternalStore } from "react";

/**
 * Volume do som da tela que cada pessoa compartilha, de 0 a 200%. Fica no
 * navegador de quem assiste e vale por usuário, não por call: quem sempre
 * transmite alto continua mais baixo da próxima vez.
 */
export const SCREEN_VOLUME_DEFAULT = 100;
export const SCREEN_VOLUME_MAX = 200;

const STORAGE_KEY = "clyro.screen-volume";
const listeners = new Set<() => void>();
let volumes: Record<string, number> = read();

function read(): Record<string, number> {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return SCREEN_VOLUME_DEFAULT;
  return Math.min(SCREEN_VOLUME_MAX, Math.max(0, Math.round(value)));
}

/**
 * Do número do controle para o ganho. O ouvido percebe volume em escala
 * logarítmica: dobrar a amplitude soa só um pouco mais alto, e o 200% linear
 * parecia não fazer nada. Ao quadrado, 200% vira 4× (+12 dB) e 50% vira ¼,
 * que soa de fato como metade.
 */
export function screenVolumeGain(volume: number) {
  const level = clamp(volume) / 100;
  return level * level;
}

export function getScreenVolume(userId: string) {
  return clamp(volumes[userId] ?? SCREEN_VOLUME_DEFAULT);
}

export function setScreenVolume(userId: string, value: number) {
  const next = { ...volumes };
  const volume = clamp(value);
  if (volume === SCREEN_VOLUME_DEFAULT) delete next[userId];
  else next[userId] = volume;
  volumes = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScreenVolume(userId: string | null | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? getScreenVolume(userId) : SCREEN_VOLUME_DEFAULT),
    () => SCREEN_VOLUME_DEFAULT,
  );
}
