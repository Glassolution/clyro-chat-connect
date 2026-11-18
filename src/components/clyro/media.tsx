import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useMediaSettings } from "@/lib/media-settings";

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
export function StreamAudio({ stream, deafened }: { stream: MediaStream; deafened: boolean }) {
  // O stream é o mesmo objeto a vida toda; o participante é recriado a cada
  // faixa que entra ou sai, e isso já renderiza de novo.
  const tracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
  return (
    <>
      {tracks.map((track) => (
        <TrackAudio key={track.id} track={track} deafened={deafened} />
      ))}
    </>
  );
}

function TrackAudio({ track, deafened }: { track: MediaStreamTrack; deafened: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const { outputDeviceId } = useMediaSettings();
  const stream = useMemo(() => new MediaStream([track]), [track]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => {
      /* autoplay bloqueado; o clique do usuário resolve */
    });
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);

  // Manda o som para o fone escolhido nas configurações; vazio devolve ao
  // padrão do sistema. Firefox e Safari ainda não têm `setSinkId`.
  useEffect(() => {
    const el = ref.current as
      (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId) return;
    void el.setSinkId(outputDeviceId).catch(() => {
      /* o dispositivo pode ter sido desconectado: fica no padrão */
    });
  }, [outputDeviceId, stream]);

  return <audio ref={ref} autoPlay />;
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
  peers: { id: string; stream: MediaStream }[];
  deafened: boolean;
}) {
  return (
    <>
      {peers.map((peer) => (
        <StreamAudio key={peer.id} stream={peer.stream} deafened={deafened} />
      ))}
    </>
  );
}
