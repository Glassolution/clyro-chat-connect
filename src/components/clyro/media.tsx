import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useMediaSettings } from "@/lib/media-settings";

export function StreamVideo({
  stream,
  muted = true,
  className,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
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

export function StreamAudio({ stream, deafened }: { stream: MediaStream; deafened: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const { outputDeviceId } = useMediaSettings();

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
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
