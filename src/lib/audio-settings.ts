import { useSyncExternalStore } from "react";

export type ScreenResolution = 720 | 1080 | 1440 | 2160;
export type ScreenFps = 15 | 30 | 60;

export type AudioSettings = {
  /** Corta ruído de fundo constante (ventilador, teclado, rua). */
  noiseSuppression: boolean;
  /** Evita que o som da sua saída volte pelo microfone. */
  echoCancellation: boolean;
  /** Nivela o volume da sua voz automaticamente. */
  autoGainControl: boolean;
  /** Voz em estéreo 48 kHz com bitrate alto — usa mais banda. */
  highFidelity: boolean;
  /** Altura máxima da tela transmitida. */
  screenResolution: ScreenResolution;
  /** Quadros por segundo da tela transmitida. */
  screenFps: ScreenFps;
};

export const AUDIO_DEFAULTS: AudioSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  highFidelity: true,
  screenResolution: 1080,
  screenFps: 30,
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
    // Captura sempre em 48 kHz; no modo alta fidelidade também em estéreo, que é
    // o que faz música e voz chegarem com corpo em vez de "telefone".
    sampleRate: 48000,
    sampleSize: 16,
    channelCount: settings.highFidelity ? 2 : 1,
  };
}

/** Teto de bitrate do áudio de voz, em bits por segundo. */
export function voiceBitrate(settings: AudioSettings): number {
  return settings.highFidelity ? 256_000 : 64_000;
}

/** Restrições de captura de tela conforme a escolha do usuário. */
export function screenConstraints(settings: AudioSettings): MediaTrackConstraints {
  const height = settings.screenResolution;
  const width = Math.round((height * 16) / 9);
  return {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: settings.screenFps, max: settings.screenFps },
  };
}

/**
 * Bitrate de vídeo proporcional a resolução e fluidez — sem isso, 1440p a 60 fps
 * fica tão borrado quanto 720p.
 */
export function screenBitrate(settings: AudioSettings): number {
  const base: Record<ScreenResolution, number> = {
    720: 3_000_000,
    1080: 6_000_000,
    1440: 10_000_000,
    2160: 18_000_000,
  };
  const fpsFactor = settings.screenFps >= 60 ? 1.6 : settings.screenFps >= 30 ? 1 : 0.7;
  return Math.round(base[settings.screenResolution] * fpsFactor);
}
