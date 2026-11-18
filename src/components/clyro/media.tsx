import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import { useMediaSettings } from "@/lib/media-settings";
import { createScreenAudioBooster, type ScreenAudioBooster } from "@/lib/screen-audio-boost";
import { screenVolumeGain, useScreenVolume } from "@/lib/screen-volume";

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

/**
 * Som da tela com volume de 0 a 200%. Até 100% toca direto, como a voz, e o
 * cancelamento de eco do navegador o enxerga. Acima disso o ganho passa pelo
 * Web Audio e volta como faixa de call (ver `screen-audio-boost`), para quem
 * está no alto-falante do notebook não devolver a tela dos outros para a sala.
 *
 * O elemento mudo com a faixa original fica porque o Chrome só entrega o som de
 * uma faixa remota ao Web Audio enquanto ela estiver presa a um elemento.
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
  const source = useMemo(() => new MediaStream([track]), [track]);
  const gain = screenVolumeGain(volume);
  const boosted = gain > 1;
  const boosterRef = useRef<ScreenAudioBooster | null>(null);
  const [boostStream, setBoostStream] = useState<MediaStream | null>(null);

  // Faixa nova (ou saída da call): desmonta a volta da anterior.
  useEffect(
    () => () => {
      boosterRef.current?.close();
      boosterRef.current = null;
      setBoostStream(null);
    },
    [source],
  );
  // A volta é montada na primeira vez que passa de 100% e fica até a faixa
  // acabar: arrastar o controle para cima e para baixo não remonta nada.
  useEffect(() => {
    if (!boosted || boosterRef.current) return;
    const booster = createScreenAudioBooster(source);
    if (!booster) return;
    boosterRef.current = booster;
    booster.ready
      .then((stream) => {
        if (boosterRef.current === booster) setBoostStream(stream);
      })
      .catch(() => {
        // Sem a volta, fica tocando direto no máximo do elemento.
        if (boosterRef.current === booster) boosterRef.current = null;
        booster.close();
      });
  }, [boosted, source]);

  const playing = boosted && boostStream ? boostStream : source;
  useEffect(() => playInto(pullRef.current, source), [source]);
  useEffect(() => playInto(ref.current, playing), [playing]);
  useEffect(() => {
    boosterRef.current?.setGain(boosted ? gain : 1);
    if (ref.current) ref.current.volume = playing === source ? Math.min(1, gain) : 1;
  }, [gain, boosted, playing, source]);
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);
  useOutputDevice(ref, playing);

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
