import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HambergerMenu } from "iconsax-react";
import { cn } from "@/lib/utils";
import { ClyroMark } from "@/components/clyro/primitives";
import { SECTIONS, type Section } from "./sections";

export type { Section };

const NAV_ITEM =
  "relative flex h-9 items-center rounded-full px-2.5 text-[14px] tracking-[-0.01em] outline-none transition-colors duration-200 ease-clyro focus-visible:ring-2 focus-visible:ring-brand";

/**
 * Barra do topo: a marca ocupa a largura da sidebar; depois, em texto, as
 * áreas do Clyro (o workspace aberto escuro, as outras cinza). No canto direito,
 * a sua conta com a troca de workspace.
 */
export function TopNav({
  section,
  badges,
  onMenu,
  onOpenWorkspace,
  profileActive = false,
  compact = false,
  account,
}: {
  section: Section;
  badges?: Partial<Record<Section, number>>;
  onMenu: () => void;
  /** "Workspace" no topo leva de volta ao Painel. */
  onOpenWorkspace: () => void;
  profileActive?: boolean;
  /**
   * Na tela da call: no desktop o topo vira só o logo em cima da sidebar e a
   * call ocupa a altura toda; os links somem também no tablet.
   */
  compact?: boolean;
  /** A sua conta (foto e menu), no canto superior direito. */
  account?: ReactNode;
}) {
  const current = SECTIONS.find((s) => s.id === section)?.label ?? "";
  const menuBadge = Object.values(badges ?? {}).reduce((n, v) => n + (v ?? 0), 0);

  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 px-3 sm:px-5 lg:h-16 lg:px-0",
        compact && "lg:absolute lg:left-0 lg:top-0 lg:z-10",
      )}
    >
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menu"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-[background-color,transform] duration-200 ease-clyro hover:bg-secondary active:scale-95 lg:hidden"
      >
        <HambergerMenu size={20} color="currentColor" />
        {menuBadge > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand ring-2 ring-card" />
        )}
      </button>

      <div className="flex min-w-0 items-center lg:w-[232px] lg:shrink-0 lg:px-6 xl:w-[248px] xl:px-7">
        <Link
          to="/"
          aria-label="Clyro: descobrir projetos"
          className="flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ClyroMark className="h-7 w-7" />
          <span className="hidden text-[16px] font-semibold tracking-[-0.03em] sm:block">
            clyro
          </span>
        </Link>
      </div>

      {/* No celular, só o nome da seção aberta; as seções moram no menu. */}
      <span className="min-w-0 truncate text-[14px] font-medium md:hidden">
        {profileActive ? "Perfil" : current}
      </span>

      <nav
        aria-label="Clyro"
        className={cn("hidden min-w-0 items-center gap-1 lg:-ml-3", !compact && "md:flex")}
      >
        <button
          type="button"
          onClick={onOpenWorkspace}
          aria-current="page"
          className={cn(NAV_ITEM, "font-medium text-foreground")}
        >
          Workspace
        </button>
        <Link to="/" className={cn(NAV_ITEM, "text-[#737373] hover:text-foreground")}>
          Descobrir
        </Link>
        <Link to="/buscar" className={cn(NAV_ITEM, "text-[#737373] hover:text-foreground")}>
          Buscar
        </Link>
      </nav>

      {/* Na call o topo some no desktop: a conta volta quando a call fecha. */}
      {account && (
        <div className={cn("ml-auto flex shrink-0 items-center lg:pr-5", compact && "lg:hidden")}>
          {account}
        </div>
      )}
    </header>
  );
}
