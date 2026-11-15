import { Link } from "@tanstack/react-router";
import { Home2, Element3, AddSquare, Briefcase, Profile } from "iconsax-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile as UserProfile } from "@/lib/clyro-types";
import { ClyroMark, UserAvatar } from "@/components/clyro/primitives";

export type SiteSection = "discover" | "categories" | "mine";

/**
 * Trilho fino da esquerda, como na referência: só ícones, o ativo sobre um
 * quadrado cinza-claro de canto 20px, e quem você é lá embaixo.
 */
export function SiteRail({
  active,
  profile,
  onPublish,
  onCategories,
}: {
  active: SiteSection;
  profile: UserProfile | null | undefined;
  onPublish: () => void;
  onCategories?: () => void;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <nav className="sticky top-0 flex h-screen w-16 shrink-0 flex-col items-center bg-card py-5 sm:w-[72px]">
        <Link to="/" aria-label="Clyro" className="mb-auto">
          <ClyroMark className="h-9 w-9" />
        </Link>

        <div className="flex flex-col items-center gap-2">
          <RailLink label="Descobrir" active={active === "discover"} to="/">
            <Home2
              size={24}
              color="currentColor"
              variant={active === "discover" ? "Bold" : "Linear"}
            />
          </RailLink>
          <RailButton label="Categorias" active={active === "categories"} onClick={onCategories}>
            <Element3 size={24} color="currentColor" variant="Linear" />
          </RailButton>
          <RailButton label="Publicar projeto" active={false} onClick={onPublish}>
            <AddSquare size={24} color="currentColor" variant="Linear" />
          </RailButton>
          <RailLink label="Minhas comunidades" active={active === "mine"} to="/app">
            <Briefcase
              size={24}
              color="currentColor"
              variant={active === "mine" ? "Bold" : "Linear"}
            />
          </RailLink>
        </div>

        <div className="mt-auto">
          {profile ? (
            <Link
              to="/app"
              aria-label="Seu perfil"
              className="block rounded-full ring-1 ring-border"
            >
              <UserAvatar profile={profile} size={32} showStatus={false} />
            </Link>
          ) : (
            <Link
              to="/auth"
              className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Profile size={22} color="currentColor" variant="Bold" />
              Entrar
            </Link>
          )}
        </div>
      </nav>
    </TooltipProvider>
  );
}

const itemClass = (active: boolean) =>
  cn(
    "flex h-12 w-12 items-center justify-center rounded-[20px] text-foreground transition-colors duration-200",
    active ? "bg-secondary" : "text-foreground/55 hover:bg-secondary hover:text-foreground",
  );

function RailLink({
  label,
  active,
  to,
  children,
}: {
  label: string;
  active: boolean;
  to: "/" | "/app";
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={to} aria-label={label} className={itemClass(active)}>
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} className={itemClass(active)}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
