import { useSyncExternalStore } from "react";

export type AudioSettings = {
  /** Corta ruído de fundo constante (ventilador, teclado, rua). */
  noiseSuppression: boolean;
  /** Evita que o som da sua saída volte pelo microfone. */
  echoCancellation: boolean;
  /** Nivela o volume da sua voz automaticamente. */
  autoGainControl: boolean;
};

export const AUDIO_DEFAULTS: AudioSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

const STORAGE_KEY = "clyro:audio-settings";

let current: AudioSettings = AUDIO_DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) current = { ...AUDIO_DEFAULTS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
  } catch {
    // Preferência corrompida não vale quebrar a entrada na call.
  }
}

export function getAudioSettings(): AudioSettings {
  hydrate();
  return current;
}

export function setAudioSetting<K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) {
  hydrate();
  current = { ...current, [key]: value };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Sem persistência (aba anônima, cota cheia) a preferência ainda vale na sessão.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAudioSettings(): AudioSettings {
  return useSyncExternalStore(subscribe, getAudioSettings, () => AUDIO_DEFAULTS);
}

/** Restrições de captura equivalentes às preferências atuais. */
export function audioConstraints(settings: AudioSettings): MediaTrackConstraints {
  return {
    noiseSuppression: settings.noiseSuppression,
    echoCancellation: settings.echoCancellation,
    autoGainControl: settings.autoGainControl,
  };
}
