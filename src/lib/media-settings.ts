import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type MediaSettings = {
  /** Corta ruído de fundo constante (ventilador, teclado, rua). */
  noiseSuppression: boolean;
  /** Evita que o som da sua saída volte pelo microfone. */
  echoCancellation: boolean;
  /** Nivela o volume da sua voz automaticamente. */
  autoGainControl: boolean;
  /** Microfone escolhido; vazio significa o padrão do sistema. */
  inputDeviceId: string;
  /** Fone/caixa onde o som da call toca; vazio significa o padrão do sistema. */
  outputDeviceId: string;
  /** Voz em estéreo 48 kHz com bitrate de música em vez do padrão de telefonia. */
  highFidelity: boolean;
  /** Altura da tela compartilhada, em linhas. */
  screenResolution: ScreenResolution;
  /** Quadros por segundo da tela compartilhada. */
  screenFps: ScreenFps;
  /** Avisos sonoros de entrada, saída e compartilhamento de tela. */
  sounds: boolean;
};

/** Alturas oferecidas na transmissão de tela — 720p a 4K. */
export const SCREEN_RESOLUTIONS = [720, 1080, 1440, 2160] as const;
export type ScreenResolution = (typeof SCREEN_RESOLUTIONS)[number];

export const SCREEN_FPS = [15, 30, 60] as const;
export type ScreenFps = (typeof SCREEN_FPS)[number];

export const MEDIA_DEFAULTS: MediaSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  inputDeviceId: "",
  outputDeviceId: "",
  highFidelity: true,
  screenResolution: 1080,
  screenFps: 30,
  sounds: true,
};

const STORAGE_KEY = "clyro:media-settings";

let current: MediaSettings = MEDIA_DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) current = { ...MEDIA_DEFAULTS, ...(JSON.parse(raw) as Partial<MediaSettings>) };
  } catch {
    // Preferência corrompida não vale quebrar a entrada na call.
  }
}

export function getMediaSettings(): MediaSettings {
  hydrate();
  return current;
}

export function setMediaSetting<K extends keyof MediaSettings>(key: K, value: MediaSettings[K]) {
  hydrate();
  if (current[key] === value) return;
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

export function useMediaSettings(): MediaSettings {
  return useSyncExternalStore(subscribe, getMediaSettings, () => MEDIA_DEFAULTS);
}

/** Restrições de captura equivalentes às preferências atuais. */
export function audioConstraints(settings: MediaSettings): MediaTrackConstraints {
  return {
    noiseSuppression: settings.noiseSuppression,
    echoCancellation: settings.echoCancellation,
    autoGainControl: settings.autoGainControl,
    // Alta fidelidade pede os dois canais e a taxa cheia. São `ideal`: o
    // tratamento de voz do navegador rebaixa para mono, e nesse caso é melhor
    // capturar mono do que a captura falhar inteira.
    channelCount: { ideal: settings.highFidelity ? 2 : 1 },
    sampleRate: { ideal: 48000 },
    ...(settings.highFidelity ? { sampleSize: { ideal: 16 } } : {}),
    // `exact` para não abrir um microfone diferente do escolhido em silêncio —
    // quem trata o dispositivo sumido é quem chama, caindo para o padrão.
    ...(settings.inputDeviceId ? { deviceId: { exact: settings.inputDeviceId } } : {}),
  };
}

/** Teto de bitrate da voz: música em alta fidelidade, fala no modo normal. */
export function voiceBitrate(settings: MediaSettings) {
  return settings.highFidelity ? 256_000 : 64_000;
}

/**
 * Captura de tela na resolução e na taxa escolhidas. A largura vem da altura
 * pela proporção 16:9 — é a forma de pedir "1440p" sem prender o formato da
 * janela que a pessoa escolher.
 */
export function displayConstraints(settings: MediaSettings): DisplayMediaStreamOptions {
  const height = settings.screenResolution;
  return {
    video: {
      width: { ideal: Math.round((height * 16) / 9) },
      height: { ideal: height },
      frameRate: { ideal: settings.screenFps, max: settings.screenFps },
    },
    // Som da tela sem tratamento de voz e nos dois canais: música e vídeo
    // chegam do outro lado como saíram daqui.
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
    },
  };
}

/**
 * Bitrate proporcional ao que foi escolhido: pixels × quadros × bits por pixel.
 * O fator é generoso porque tela tem texto — o que denuncia compressão antes de
 * qualquer outra coisa.
 */
export function screenBitrate(settings: MediaSettings) {
  const height = settings.screenResolution;
  const pixels = Math.round((height * 16) / 9) * height;
  const raw = pixels * settings.screenFps * 0.07;
  return Math.round(Math.min(40_000_000, Math.max(2_500_000, raw)));
}

/** Teto do som que acompanha a tela — estéreo, na qualidade de música. */
export const SCREEN_AUDIO_BITRATE = 256_000;

/**
 * O que a faixa está mesmo entregando bate com o que foi pedido? Vários
 * navegadores aceitam `applyConstraints` sem trocar nada de fato, e nenhum
 * troca de dispositivo por esse caminho — sem esta conferência a pessoa mexia
 * no botão e o áudio continuava igual.
 */
export function trackMatchesSettings(track: MediaStreamTrack, settings: MediaSettings) {
  const applied = track.getSettings();
  const same = (got: boolean | undefined, want: boolean) => got === undefined || got === want;
  const deviceOk = !settings.inputDeviceId || applied.deviceId === settings.inputDeviceId;
  // Estéreo é um pedido, não uma exigência: com o tratamento de voz ligado o
  // navegador entrega mono e insistir só faria a captura reabrir sem parar.
  return (
    deviceOk &&
    same(applied.noiseSuppression, settings.noiseSuppression) &&
    same(applied.echoCancellation, settings.echoCancellation) &&
    same(applied.autoGainControl, settings.autoGainControl)
  );
}

/** Abre o microfone preferido, caindo para o padrão se ele tiver sumido. */
export async function openMicrophone(settings: MediaSettings): Promise<MediaStream | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints(settings),
      video: false,
    });
  } catch {
    if (!settings.inputDeviceId) return null;
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints({ ...settings, inputDeviceId: "" }),
        video: false,
      });
    } catch {
      return null;
    }
  }
}

/** Firefox e Safari ainda não deixam escolher a saída de áudio pela página. */
export const supportsOutputSelection =
  typeof window !== "undefined" &&
  typeof HTMLMediaElement !== "undefined" &&
  "setSinkId" in HTMLMediaElement.prototype;

export type AudioDevice = { deviceId: string; label: string };

/**
 * Microfones e saídas disponíveis, acompanhando o que for plugado ou removido.
 * Enquanto ninguém tiver dado permissão de microfone o navegador entrega a
 * lista sem nomes — daí o `needsPermission`.
 */
export function useAudioDevices() {
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [needsPermission, setNeedsPermission] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const pick = (kind: MediaDeviceKind, fallback: string) => {
      const seen = new Set<string>();
      return devices
        .filter(
          (d) => d.kind === kind && d.deviceId && !seen.has(d.deviceId) && seen.add(d.deviceId),
        )
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `${fallback} ${index + 1}`,
        }));
    };
    setInputs(pick("audioinput", "Microfone"));
    setOutputs(pick("audiooutput", "Saída"));
    const raw = devices.filter((d) => d.kind === "audioinput" && d.deviceId);
    setNeedsPermission(raw.length > 0 && raw.every((d) => !d.label));
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return;
    const handler = () => void refresh();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refresh]);

  /** Abre e fecha o microfone só para o navegador liberar os nomes na lista. */
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Permissão negada: a lista segue sem nomes, e a escolha ainda funciona.
    }
    await refresh();
  }, [refresh]);

  return { inputs, outputs, needsPermission, refresh, requestPermission };
}
