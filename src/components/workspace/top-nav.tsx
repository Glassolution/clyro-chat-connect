import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { HambergerMenu, SidebarLeft } from "iconsax-react";
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
  sidebarCollapsed = false,
  onToggleSidebar,
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
  /** Desktop: a sidebar está minimizada; a coluna da marca estreita junto. */
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
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

      {/*
       * A coluna da marca tem a largura da sidebar e estreita junto com ela. O
       * logo não sai do lugar: só o nome e o botão de minimizar somem.
       */}
      <div
        className={cn(
          "flex min-w-0 items-center lg:shrink-0 lg:overflow-hidden lg:px-6 lg:transition-[width] lg:duration-300 lg:ease-clyro motion-reduce:transition-none xl:px-7",
          sidebarCollapsed ? "lg:w-[76px] xl:w-[84px]" : "lg:w-[232px] xl:w-[248px]",
        )}
      >
        <Link
          to="/"
          aria-label="Clyro: descobrir projetos"
          className="flex shrink-0 items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ClyroMark className="h-7 w-7 shrink-0" />
          <span
            className={cn(
              "hidden text-[16px] font-semibold tracking-[-0.03em] transition-opacity duration-200 ease-clyro sm:block",
              sidebarCollapsed && "lg:opacity-0",
            )}
          >
            clyro
          </span>
        </Link>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Minimizar a barra lateral"
            title="Minimizar a barra lateral"
            tabIndex={sidebarCollapsed ? -1 : 0}
            className={cn(
              "-mr-2 ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-ink-faint outline-none transition-[opacity,background-color,color,transform] duration-200 ease-clyro hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand active:scale-95 lg:flex",
              sidebarCollapsed && "pointer-events-none opacity-0",
            )}
          >
            <SidebarLeft size={19} color="currentColor" />
          </button>
        )}
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
        <Link to="/" className={cn(NAV_ITEM, "text-muted-foreground hover:text-foreground")}>
          Descobrir
        </Link>
        <Link to="/buscar" className={cn(NAV_ITEM, "text-muted-foreground hover:text-foreground")}>
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
