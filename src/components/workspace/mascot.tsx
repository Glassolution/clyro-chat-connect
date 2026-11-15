import { cn } from "@/lib/utils";

/**
 * O mascote do Clyro: um bolinho laranja de vidro. Cada pose acompanha um
 * momento — vazio, conquista, convite, carregando.
 */
export type MascotPose = "neutro" | "energia" | "estrela" | "chuva" | "sorte" | "brincando";

export function Mascot({
  pose = "neutro",
  size = 96,
  className,
  float = false,
}: {
  pose?: MascotPose;
  size?: number;
  className?: string;
  /** Flutua devagar — só em estados vazios e no onboarding. */
  float?: boolean;
}) {
  return (
    <img
      src={`/mascot/${pose}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("select-none object-contain", float && "mascot-float", className)}
    />
  );
}

/** Estado vazio padrão: mascote, título curto, uma frase e uma ação. */
export function EmptyState({
  pose = "neutro",
  title,
  body,
  action,
  className,
}: {
  pose?: MascotPose;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      <Mascot pose={pose} size={112} float />
      <div className="max-w-sm space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}
