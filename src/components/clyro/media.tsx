import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

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
    const el = ref.current;
    if (!el || !stream) return;
    /*
     * Reatribuir o srcObject sempre que a trilha muda. Quando a tela entra
     * depois (o stream do participante já estava tocando só o áudio), o vídeo
     * novo não é pego sozinho pelo elemento — era isso que deixava tudo preto.
     */
    const attach = () => {
      el.srcObject = null;
      el.srcObject = stream;
      void el.play().catch(() => {
        /* autoplay bloqueado; o clique do usuário resolve */
      });
    };
    attach();
    stream.addEventListener("addtrack", attach);
    stream.addEventListener("removetrack", attach);
    return () => {
      stream.removeEventListener("addtrack", attach);
      stream.removeEventListener("removetrack", attach);
    };
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
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);
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
