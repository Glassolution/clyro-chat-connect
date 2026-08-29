import { getMediaSettings } from "@/lib/media-settings";

/**
 * Sons da chamada, sintetizados na hora em vez de vir de arquivos: são
 * senoides com ataque macio e cauda curta, filtradas no agudo para não ter
 * nada de metálico. Duas notas bastam — sobe quando alguém chega, desce quando
 * sai — e o conjunto some em menos de meio segundo, do jeito que um aviso
 * discreto tem que ser.
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // Depois de um gesto da pessoa o contexto acorda; antes disso não há som
    // nenhum para tocar mesmo.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

type Note = {
  /** Frequência em Hz. */
  hz: number;
  /** Atraso em relação ao início do som, em segundos. */
  at: number;
  /** Duração audível da nota. */
  length: number;
  gain: number;
};

function play(notes: Note[], volume: number) {
  if (!getMediaSettings().sounds) return;
  const context = audioContext();
  if (!context) return;

  // Um filtro só para o som inteiro: corta o brilho que deixaria o aviso
  // estridente em fone de ouvido.
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;
  filter.Q.value = 0.4;

  const master = context.createGain();
  master.gain.value = volume;
  filter.connect(master);
  master.connect(context.destination);

  const now = context.currentTime + 0.01;
  notes.forEach((note) => {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = note.hz;

    const envelope = context.createGain();
    // Rampas exponenciais: subida em 15 ms (sem estalo) e cauda longa o
    // bastante para o som "derreter" em vez de cortar.
    const start = now + note.at;
    const peak = start + 0.015;
    const end = peak + note.length;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(note.gain, peak);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(envelope);
    envelope.connect(filter);
    osc.start(start);
    osc.stop(end + 0.02);
  });
}

/** Você entrou na chamada: duas notas subindo. */
export function playJoinSound() {
  play(
    [
      { hz: 587.33, at: 0, length: 0.16, gain: 0.5 },
      { hz: 880, at: 0.075, length: 0.26, gain: 0.42 },
    ],
    0.16,
  );
}

/** Você saiu: as mesmas notas, na ordem inversa. */
export function playLeaveSound() {
  play(
    [
      { hz: 880, at: 0, length: 0.14, gain: 0.42 },
      { hz: 587.33, at: 0.075, length: 0.3, gain: 0.5 },
    ],
    0.16,
  );
}

/** Alguém chegou na sala — mesma ideia, mais discreto que o seu próprio. */
export function playPeerJoinSound() {
  play(
    [
      { hz: 659.25, at: 0, length: 0.13, gain: 0.45 },
      { hz: 987.77, at: 0.07, length: 0.22, gain: 0.35 },
    ],
    0.1,
  );
}

/** Alguém saiu da sala. */
export function playPeerLeaveSound() {
  play(
    [
      { hz: 987.77, at: 0, length: 0.12, gain: 0.35 },
      { hz: 659.25, at: 0.07, length: 0.24, gain: 0.45 },
    ],
    0.1,
  );
}

/** Transmissão de tela começou: um acorde curto e brilhante. */
export function playScreenShareSound() {
  play(
    [
      { hz: 783.99, at: 0, length: 0.12, gain: 0.4 },
      { hz: 1046.5, at: 0.055, length: 0.14, gain: 0.34 },
      { hz: 1318.51, at: 0.11, length: 0.26, gain: 0.26 },
    ],
    0.13,
  );
}

/** Transmissão de tela encerrada. */
export function playScreenStopSound() {
  play(
    [
      { hz: 1046.5, at: 0, length: 0.12, gain: 0.32 },
      { hz: 783.99, at: 0.06, length: 0.26, gain: 0.4 },
    ],
    0.13,
  );
}
