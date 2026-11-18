import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import { useMediaSettings } from "@/lib/media-settings";
import { useScreenVolume } from "@/lib/screen-volume";

export function StreamVideo({
  stream,
  muted = true,
  className,
  onAspect,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  /** Avisa a proporção real do vídeo (largura ÷ altura) e cada vez que ela muda. */
  onAspect?: (ratio: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const onAspectRef = useRef(onAspect);
  onAspectRef.current = onAspect;

  // Quem compartilha pode trocar de aba ou redimensionar a janela no meio da
  // transmissão: o evento `resize` do vídeo pega essas mudanças também.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        onAspectRef.current?.(el.videoWidth / el.videoHeight);
      }
    };
    report();
    el.addEventListener("loadedmetadata", report);
    el.addEventListener("resize", report);
    return () => {
      el.removeEventListener("loadedmetadata", report);
      el.removeEventListener("resize", report);
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    // Não zera srcObject: isso destrói o decoder e pode deixar uma transmissão
    // estática preta até o navegador receber outro keyframe.
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    void el.play().catch(() => {
      /* autoplay bloqueado; o clique do usuário resolve */
    });
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn("h-full w-full object-contain", className)}
    />
  );
}

/**
 * Toca todo o som de uma pessoa: voz e, quando ela compartilha a tela com
 * áudio, o som da aba ou do sistema. O stream do participante junta as duas
 * faixas, e o Chrome toca só uma faixa de áudio por elemento — o som da tela
 * sumia mesmo com "compartilhar áudio" ligado. Cada faixa ganha o seu.
 */
export function StreamAudio({
  stream,
  deafened,
  userId,
  voiceTrackId,
}: {
  stream: MediaStream;
  deafened: boolean;
  userId: string;
  voiceTrackId?: string | undefined;
}) {
  const screenVolume = useScreenVolume(userId);
  // O stream é o mesmo objeto a vida toda; o participante é recriado a cada
  // faixa que entra ou sai, e isso já renderiza de novo.
  const tracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
  return (
    <>
      {tracks.map((track) =>
        // Enquanto a voz não foi identificada, tudo toca como voz: melhor do que
        // mexer no volume da pessoa errada.
        !voiceTrackId || track.id === voiceTrackId ? (
          <TrackAudio key={track.id} track={track} deafened={deafened} />
        ) : (
          <ScreenTrackAudio
            key={track.id}
            track={track}
            deafened={deafened}
            volume={screenVolume}
          />
        ),
      )}
    </>
  );
}

/** Manda o som para o fone escolhido nas configurações; vazio é o padrão do sistema. */
function useOutputDevice(ref: React.RefObject<HTMLAudioElement | null>, stream: MediaStream) {
  const { outputDeviceId } = useMediaSettings();
  // Firefox e Safari ainda não têm `setSinkId`.
  useEffect(() => {
    const el = ref.current as
      (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId) return;
    void el.setSinkId(outputDeviceId).catch(() => {
      /* o dispositivo pode ter sido desconectado: fica no padrão */
    });
  }, [ref, outputDeviceId, stream]);
}

function playInto(el: HTMLAudioElement | null, stream: MediaStream) {
  if (!el) return;
  el.srcObject = stream;
  void el.play().catch(() => {
    /* autoplay bloqueado; o clique do usuário resolve */
  });
}

function TrackAudio({ track, deafened }: { track: MediaStreamTrack; deafened: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const stream = useMemo(() => new MediaStream([track]), [track]);

  useEffect(() => playInto(ref.current, stream), [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);
  useOutputDevice(ref, stream);

  return <audio ref={ref} autoPlay />;
}

let screenAudioContext: AudioContext | null = null;
function sharedAudioContext() {
  if (typeof AudioContext === "undefined") return null;
  if (!screenAudioContext || screenAudioContext.state === "closed") {
    screenAudioContext = new AudioContext({ latencyHint: "interactive" });
  }
  if (screenAudioContext.state === "suspended") void screenAudioContext.resume().catch(() => {});
  return screenAudioContext;
}

/**
 * Som da tela com volume de 0 a 200%. O `volume` do elemento para em 100%,
 * então o ganho passa por um nó de áudio. O elemento mudo com a faixa original
 * fica porque o Chrome só entrega o som de uma faixa remota ao Web Audio
 * enquanto ela também estiver presa a um elemento de mídia.
 */
function ScreenTrackAudio({
  track,
  deafened,
  volume,
}: {
  track: MediaStreamTrack;
  deafened: boolean;
  volume: number;
}) {
  const pullRef = useRef<HTMLAudioElement>(null);
  const ref = useRef<HTMLAudioElement>(null);
  const gainRef = useRef<GainNode | null>(null);
  const source = useMemo(() => new MediaStream([track]), [track]);
  const [output, setOutput] = useState<MediaStream | null>(null);

  useEffect(() => {
    const ctx = sharedAudioContext();
    if (!ctx) {
      // Sem Web Audio, toca direto e o volume para em 100%.
      setOutput(source);
      return;
    }
    const input = ctx.createMediaStreamSource(source);
    const gain = ctx.createGain();
    const destination = ctx.createMediaStreamDestination();
    input.connect(gain).connect(destination);
    gainRef.current = gain;
    setOutput(destination.stream);
    return () => {
      input.disconnect();
      gain.disconnect();
      gainRef.current = null;
    };
  }, [source]);

  useEffect(() => playInto(pullRef.current, source), [source]);
  useEffect(() => {
    if (output) playInto(ref.current, output);
  }, [output]);

  useEffect(() => {
    const gain = gainRef.current;
    const level = volume / 100;
    if (gain) gain.gain.setTargetAtTime(level, gain.context.currentTime, 0.02);
    else if (ref.current) ref.current.volume = Math.min(1, level);
  }, [volume, output]);
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);
  useOutputDevice(ref, output ?? source);

  return (
    <>
      <audio ref={pullRef} autoPlay muted />
      <audio ref={ref} autoPlay />
    </>
  );
}

/**
 * Áudio dos participantes, montado fora do palco de voz. Enquanto você estiver
 * na call o som continua mesmo navegando para outro canal — se ficasse dentro
 * dos tiles, sair da tela da chamada derrubaria o áudio junto.
 */
export function VoiceAudio({
  peers,
  deafened,
}: {
  peers: { id: string; userId: string; stream: MediaStream; voiceTrackId?: string | undefined }[];
  deafened: boolean;
}) {
  return (
    <>
      {peers.map((peer) => (
        <StreamAudio
          key={peer.id}
          stream={peer.stream}
          deafened={deafened}
          userId={peer.userId}
          voiceTrackId={peer.voiceTrackId}
        />
      ))}
    </>
  );
}
