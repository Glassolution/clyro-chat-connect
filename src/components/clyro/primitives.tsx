import { cn } from "@/lib/utils";
import type { PresenceStatus, Profile } from "@/lib/clyro-types";
import { initialsOf } from "@/lib/clyro-types";

export function ClyroMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6", className)} aria-hidden="true">
      <path
        d="M8 4h16a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H12l-7 5.5V24a5 5 0 0 1-1-3V9a5 5 0 0 1 4-5Z"
        fill="currentColor"
      />
      <rect x="8.1" y="10.2" width="4.6" height="1.5" rx="0.75" fill="var(--color-surface)" />
      <rect x="9.7" y="8.6" width="1.5" height="4.6" rx="0.75" fill="var(--color-surface)" />
      <rect x="15.2" y="12.4" width="2.9" height="7" rx="1.45" fill="var(--color-surface)" />
      <rect x="20.6" y="12.4" width="2.9" height="7" rx="1.45" fill="var(--color-surface)" />
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
}: {
  status: PresenceStatus | undefined;
  className?: string;
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
      className={cn(
        "rounded-full ring-2 ring-[var(--color-surface)]",
        color,
        className ?? "h-3 w-3",
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
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground font-medium transition-shadow",
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
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3"
        />
      )}
    </span>
  );
}
