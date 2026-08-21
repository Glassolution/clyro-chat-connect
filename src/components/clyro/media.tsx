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
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = deafened;
  }, [deafened]);
  return <audio ref={ref} autoPlay />;
}
