import { useId } from "react";
import { cn } from "@/lib/utils";
import { useMediaUrl } from "@/lib/profile-media";
import type { PresenceStatus, Profile } from "@/lib/clyro-types";
import { initialsOf } from "@/lib/clyro-types";

/**
 * Símbolo do Clyro: o mascote laranja, redesenhado em vetor para ficar nítido
 * em qualquer tamanho (o PNG antigo tinha 256px e vinha borrado). O vidro é um
 * degradê radial com um brilho no alto; os olhos são duas pílulas brancas.
 * `glyphClassName` ficou do desenho antigo e é ignorado.
 */
export function ClyroMark({ className }: { className?: string; glyphClassName?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn("h-6 w-6 shrink-0 select-none", className)}
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="44%" cy="62%" r="68%">
          <stop offset="0" stopColor="#f04a14" />
          <stop offset="0.5" stopColor="#ff6a13" />
          <stop offset="0.82" stopColor="#ff8d3a" />
          <stop offset="1" stopColor="#ffb25e" />
        </radialGradient>
        <radialGradient id={`${id}-shine`} cx="34%" cy="22%" r="42%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#b8360a" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="54" height="54" rx="19" fill={`url(#${id}-body)`} />
      <rect x="5" y="5" width="54" height="54" rx="19" fill={`url(#${id}-shine)`} />
      <rect
        x="5.6"
        y="5.6"
        width="52.8"
        height="52.8"
        rx="18.4"
        fill="none"
        stroke={`url(#${id}-rim)`}
        strokeWidth="1.2"
      />
      <rect x="21.5" y="20" width="5.5" height="12" rx="2.75" fill="#fff" />
      <rect x="37" y="20" width="5.5" height="12" rx="2.75" fill="#fff" />
    </svg>
  );
}

export function ClyroWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ClyroMark className="h-6 w-6" />
      <span className="text-xl font-semibold tracking-tight">Clyro</span>
    </span>
  );
}

export function StatusDot({
  status,
  className,
  style,
}: {
  status: PresenceStatus | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  const color =
    status === "online"
      ? "bg-online"
      : status === "idle"
        ? "bg-idle"
        : status === "dnd"
          ? "bg-dnd"
          : "bg-offline";
  return (
    <span
      style={style}
      className={cn(
        "block shrink-0 rounded-full ring-2 ring-panel",
        color,
        !style && "h-3 w-3",
        className,
      )}
    />
  );
}

/**
 * <img> para as imagens do bucket privado. Um link do tempo em que o bucket era
 * público não abre mais: quando o navegador recusa, ele é reassinado na hora e
 * a imagem aparece sozinha, sem ninguém recarregar a página.
 */
export function MediaImage({
  src,
  alt = "",
  className,
  ...rest
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "className" | "onError">) {
  const media = useMediaUrl(src);
  if (!media.src) return null;
  return <img src={media.src} alt={alt} onError={media.onError} className={className} {...rest} />;
}

const AVATAR_POSES = ["neutro", "energia", "sorte", "brincando", "estrela"] as const;

function mascotFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_POSES[h % AVATAR_POSES.length];
}

export function UserAvatar({
  profile,
  size = 36,
  showStatus = true,
  speaking = false,
  className,
}: {
  profile: Profile | undefined;
  size?: number;
  showStatus?: boolean;
  speaking?: boolean;
  className?: string;
}) {
  const name = profile?.display_name || profile?.username || "?";
  const dotSize = Math.max(8, Math.round(size * 0.3));
  // A foto pode ser um link antigo do tempo em que o bucket era público: o
  // hook reassina na hora se o navegador recusar, sem esperar um recarregar.
  const avatar = useMediaUrl(profile?.avatar_url);
  // Sem foto, o mascote faz as vezes de retrato: a pose sai do id, então a
  // mesma pessoa tem sempre o mesmo bolinho e duas pessoas lado a lado variam.
  const fallback = !avatar.src && profile ? mascotFor(profile.id) : null;
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full font-medium transition-shadow duration-100 ease-clyro",
          fallback ? "bg-brand-soft" : "bg-primary text-primary-foreground",
          speaking && "speaking-ring",
        )}
        style={{ fontSize: Math.max(10, size * 0.36) }}
      >
        {avatar.src ? (
          <img
            src={avatar.src}
            alt={name}
            onError={avatar.onError}
            className="h-full w-full object-cover"
          />
        ) : fallback ? (
          <img
            src={`/mascot/${fallback}.png`}
            alt={name}
            draggable={false}
            className="h-[82%] w-[82%] translate-y-[6%] select-none object-contain"
          />
        ) : (
          initialsOf(name) || "?"
        )}
      </span>
      {showStatus && (
        <StatusDot
          status={profile?.status}
          className="absolute bottom-0 right-0 translate-x-[15%] translate-y-[15%]"
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </span>
  );
}
