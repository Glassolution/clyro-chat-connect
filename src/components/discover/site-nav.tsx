import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CloseCircle } from "iconsax-react";
import { cn } from "@/lib/utils";
import type { Profile as UserProfile } from "@/lib/clyro-types";
import { ClyroMark, UserAvatar } from "@/components/clyro/primitives";
import { Mascot } from "@/components/workspace/mascot";

/**
 * Faixa laranja do topo: o único bloco de cor cheia da página. Texto em mono,
 * caixa alta, com os mascotes espiando nas pontas.
 */
export function PromoBanner({ onClick }: { onClick: () => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="relative flex h-9 items-center justify-center overflow-hidden bg-brand text-white">
      <div className="pointer-events-none absolute left-[8%] hidden items-center gap-6 md:flex">
        <Mascot pose="estrela" size={24} />
        <Mascot pose="energia" size={22} />
      </div>
      <button
        type="button"
        onClick={onClick}
        className="group flex items-center gap-1.5 px-10 text-[14px] leading-none tracking-[-0.01em]"
      >
        {/* Sans em caixa normal: lê de relance, sem cara de terminal. */}
        <span className="font-semibold">Tem uma startup?</span>
        <span className="hidden font-medium text-white/95 sm:inline">
          Publique e encontre o seu time
        </span>
        <ArrowRight
          size={15}
          color="currentColor"
          className="ml-0.5 transition-transform duration-200 ease-clyro group-hover:translate-x-0.5"
        />
      </button>
      <div className="pointer-events-none absolute right-[10%] hidden items-center gap-6 md:flex">
        <Mascot pose="sorte" size={22} />
        <Mascot pose="brincando" size={24} />
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => setOpen(false)}
        className="absolute right-3 text-white/80 transition-colors hover:text-white"
      >
        <CloseCircle size={16} color="currentColor" />
      </button>
    </div>
  );
}

export type NavItem = { label: string; onClick?: () => void; to?: "/" | "/app"; active?: boolean };

/**
 * Barra de navegação: marca, links em pílulas cinza de 8px e, à direita, o par
 * "Entrar" (passivo) + "Publicar projeto" (laranja, a ação principal).
 */
export function SiteNav({
  items,
  profile,
  signedIn,
  onPublish,
}: {
  items: NavItem[];
  profile: UserProfile | null | undefined;
  signedIn: boolean;
  onPublish: () => void;
}) {
  // Rolou a página: a barra ganha linha fina e sombra para se separar do conteúdo.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-300 ease-clyro",
        scrolled
          ? "border-transparent bg-paper/85 shadow-[0_0.7px_1.5px_rgb(0_0_0/0.015),0_3px_9px_rgb(0_0_0/0.03)] backdrop-blur-xl"
          : "border-transparent bg-paper/0",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="Clyro"
          className="mr-2 flex h-10 w-10 items-center justify-center rounded-md transition-transform duration-200 ease-clyro hover:scale-105 active:scale-95"
        >
          <ClyroMark className="h-10 w-10" />
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {items.map((item) =>
            item.to ? (
              <Link key={item.label} to={item.to} className={pillClass(item.active)}>
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className={pillClass(item.active)}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {signedIn && profile ? (
            <Link
              to="/app"
              aria-label="Seu perfil"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-black/[0.08] transition-[box-shadow,transform] duration-200 ease-clyro hover:ring-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-95"
            >
              {/* Bloco do tamanho exato da foto: o anel não pega a altura da linha. */}
              <UserAvatar profile={profile} size={36} showStatus={false} />
            </Link>
          ) : (
            <Link to="/auth" className={pillClass(false)}>
              Entrar
            </Link>
          )}
          <button type="button" onClick={onPublish} className={buttonPrimary("h-9")}>
            Publicar projeto
          </button>
        </div>
      </div>
    </header>
  );
}

/** Link de navegação do caderno: texto apagado que escurece no hover, sem pílula cinza. */
const pillClass = (active?: boolean) =>
  cn(
    "flex h-9 items-center rounded-lg px-3 text-[14px] font-medium tracking-[-0.01em] transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.97]",
    active ? "text-foreground" : "text-black/55 hover:bg-black/[0.04] hover:text-foreground",
  );

/** Ação principal: laranja cheio, canto de 8px. */
export const buttonPrimary = (extra?: string) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[14px] font-medium text-white transition-[background-color,transform] duration-200 ease-clyro hover:bg-brand-strong active:translate-y-px active:scale-[0.98]",
    extra,
  );

/** Ação secundária: transparente com borda. */
export const buttonGhost = (extra?: string) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[#fbe6d6] px-4 text-[14px] font-medium text-brand-ink transition-[background-color,transform] duration-200 ease-out hover:bg-peach active:translate-y-px active:scale-[0.98]",
    extra,
  );
