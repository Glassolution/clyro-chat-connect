import { Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  LayoutGrid,
  MessageCircle,
  MessagesSquare,
  Settings,
  Users,
} from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/clyro-types";
import { ClyroMark, UserAvatar } from "@/components/clyro/primitives";

export type Section = "dashboard" | "rooms" | "messages" | "team" | "tasks";

const ITEMS: { id: Section; label: string; icon: typeof LayoutGrid }[] = [
  { id: "dashboard", label: "Painel", icon: LayoutGrid },
  { id: "tasks", label: "Tasks", icon: CalendarCheck },
  { id: "rooms", label: "Salas e reuniões", icon: MessagesSquare },
  { id: "messages", label: "Mensagens diretas", icon: MessageCircle },
  { id: "team", label: "Equipe", icon: Users },
];

/**
 * Trilho da esquerda: ícones finos, o ativo dentro de um quadrado de canto
 * largo. Configurações e o seu avatar ficam embaixo, separados do resto.
 */
export function NavRail({
  section,
  onSection,
  badges,
  profile,
  speaking,
  onSettings,
  onProfile,
}: {
  section: Section;
  onSection: (section: Section) => void;
  badges?: Partial<Record<Section, number>>;
  profile: Profile | undefined;
  speaking?: boolean;
  onSettings: () => void;
  onProfile: () => void;
}) {
  return (
    <nav className="flex h-full w-[88px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-6 sm:w-[104px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/" aria-label="Descobrir projetos" className="rounded-2xl">
            <ClyroMark className="h-9 w-9" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Descobrir projetos</TooltipContent>
      </Tooltip>

      <div className="mt-10 flex flex-1 flex-col items-center gap-3">
        {ITEMS.map((item) => (
          <RailItem
            key={item.id}
            label={item.label}
            active={section === item.id}
            badge={badges?.[item.id]}
            onClick={() => onSection(item.id)}
          >
            <item.icon size={22} />
          </RailItem>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4">
        <RailItem label="Configurações" active={false} onClick={onSettings}>
          <Settings size={22} />
        </RailItem>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onProfile}
              aria-label="Seu perfil"
              className="group relative flex items-center"
            >
              <span
                aria-hidden
                className="absolute -left-[22px] h-7 w-1.5 rounded-r-full bg-primary sm:-left-[30px]"
              />
              <span className="rounded-[18px] border-2 border-primary p-[3px] transition-transform duration-200 ease-clyro group-hover:scale-[1.04]">
                <span className="block overflow-hidden rounded-[13px]">
                  <UserAvatar
                    profile={profile}
                    size={52}
                    showStatus={false}
                    speaking={speaking ?? false}
                    className="[&>span]:rounded-[13px]"
                  />
                </span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Seu perfil</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}

function RailItem({
  label,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  badge?: number | undefined;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex h-[60px] w-[60px] items-center justify-center rounded-[20px] text-foreground transition-all duration-200 ease-clyro sm:h-[68px] sm:w-[68px] sm:rounded-[22px]",
            active
              ? "border border-border bg-card shadow-card"
              : "text-foreground/80 hover:bg-accent hover:text-foreground",
          )}
        >
          {children}
          {!!badge && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground ring-4 ring-sidebar">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
