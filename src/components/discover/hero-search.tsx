import { useEffect, useRef, useState } from "react";
import { ArrowRight, CloseCircle, SearchNormal1 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/project-queries";
import { usePrefersReducedMotion } from "@/hooks/use-reveal";

/**
 * Busca do hero. Branca, com anel fino; no foco, o anel vira laranja com um
 * halo claro. Vazia, ela sugere as áreas de verdade, uma por vez, e a tecla
 * "/" leva o cursor até ela de qualquer ponto da página.
 */
export function HeroSearch({
  value,
  onChange,
  onSubmit,
  className,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [word, setWord] = useState(0);
  const reduced = usePrefersReducedMotion();
  const idle = value === "" && !focused;

  // Troca a área sugerida a cada 2,4s, só enquanto ninguém está digitando.
  useEffect(() => {
    if (!idle) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setWord((w) => (w + 1) % CATEGORIES.length);
    }, 2400);
    return () => window.clearInterval(t);
  }, [idle]);

  // "/" em qualquer lugar foca a busca (menos quando já se está digitando).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = CATEGORIES[word]?.label ?? "";

  return (
    <form
      role="search"
      style={style}
      className={cn("w-full max-w-[480px]", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="busca-projetos" className="sr-only">
        Buscar projetos
      </label>
      <div
        className={cn(
          "group/search flex h-12 items-center rounded-lg bg-white pl-4 pr-1.5 text-left [view-transition-name:busca]",
          "shadow-[0_0_0_1px_var(--edge-strong),0_1px_2px_rgb(0_0_0/0.04),0_10px_28px_-18px_rgb(0_0_0/0.22)]",
          "transition-shadow duration-300 ease-clyro hover:shadow-[0_0_0_1px_#a8a8a8,0_1px_2px_rgb(0_0_0/0.04),0_10px_28px_-18px_rgb(0_0_0/0.22)]",
          "focus-within:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--brand-soft),0_10px_28px_-18px_rgb(0_0_0/0.22)] focus-within:hover:shadow-[0_0_0_1px_var(--brand),0_0_0_4px_var(--brand-soft),0_10px_28px_-18px_rgb(0_0_0/0.22)]",
        )}
      >
        <SearchNormal1
          size={18}
          color="currentColor"
          className="shrink-0 text-muted-foreground transition-colors duration-200 group-focus-within/search:text-foreground"
        />
        <div className="relative h-full min-w-0 flex-1">
          <input
            ref={input}
            id="busca-projetos"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={focused ? "Nome, área ou função" : ""}
            className="h-full w-full bg-transparent px-3 text-[15px] tracking-[-0.01em] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
          {/* Sugestão que troca: fica atrás do campo e some ao focar. */}
          {idle && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 right-2 flex items-center overflow-hidden whitespace-nowrap text-[15px] tracking-[-0.01em] text-muted-foreground"
            >
              Busque projetos de&nbsp;
              <span key={reduced ? "fixo" : word} className="word-in font-medium text-foreground">
                {label}
              </span>
            </span>
          )}
        </div>

        {value ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <CloseCircle size={16} color="currentColor" />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className={cn(
              "mr-2 hidden h-6 min-w-6 items-center justify-center rounded-[4px] bg-surface-1 px-1.5 font-mono text-[11px] text-muted-foreground shadow-[0_0_0_1px_var(--edge)] transition-opacity duration-200 sm:flex",
              focused && "opacity-0",
            )}
          >
            /
          </kbd>
        )}

        <button
          type="submit"
          className="group/go flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-foreground pl-3.5 pr-3 text-[13px] font-medium text-background transition-[background-color,transform] duration-200 ease-clyro hover:bg-brand active:scale-[0.97]"
        >
          Buscar
          <ArrowRight
            size={14}
            color="currentColor"
            className="transition-transform duration-200 ease-clyro group-hover/go:translate-x-0.5"
          />
        </button>
      </div>
    </form>
  );
}
