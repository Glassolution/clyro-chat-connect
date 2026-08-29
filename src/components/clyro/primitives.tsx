import { cn } from "@/lib/utils";
import type { PresenceStatus, Profile } from "@/lib/clyro-types";
import { initialsOf } from "@/lib/clyro-types";

export function ClyroMark({
  className,
  glyphClassName,
}: {
  className?: string;
  glyphClassName?: string;
}) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6 text-white", className)} aria-hidden="true">
      <path
        d="M8 4h16a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H12l-7 5.5V24a5 5 0 0 1-1-3V9a5 5 0 0 1 4-5Z"
        fill="currentColor"
      />
      <g className={cn("text-rail", glyphClassName)} fill="currentColor">
        <rect x="8.1" y="10.2" width="4.6" height="1.5" rx="0.75" />
        <rect x="9.7" y="8.6" width="1.5" height="4.6" rx="0.75" />
        <rect x="15.2" y="12.4" width="2.9" height="7" rx="1.45" />
        <rect x="20.6" y="12.4" width="2.9" height="7" rx="1.45" />
      </g>
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
  speaking = false,
  className,
  style,
}: {
  status: PresenceStatus | undefined;
  /** Falando agora: a bola acende em verde, seja qual for o status. */
  speaking?: boolean;
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
        "block shrink-0 rounded-full ring-2 ring-panel transition-[background-color,box-shadow] duration-100",
        speaking ? "bg-online speaking-dot" : color,
        !style && "h-3 w-3",
        className,
      )}
    />
  );
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
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground font-medium transition-shadow duration-100 ease-clyro",
          speaking && "speaking-ring",
        )}
        style={{ fontSize: Math.max(10, size * 0.36) }}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt={name} className="h-full w-full object-cover" />
        ) : (
          initialsOf(name) || "?"
        )}
      </span>
      {showStatus && (
        <StatusDot
          status={profile?.status}
          speaking={speaking}
          className="absolute bottom-0 right-0 translate-x-[15%] translate-y-[15%]"
          style={{ width: dotSize, height: dotSize }}
        />
      )}
    </span>
  );
}
