import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RevealVariant = "up" | "fade" | "scale";

const VARIANT_CLASS: Record<RevealVariant, string> = {
  up: "clyro-reveal",
  fade: "clyro-reveal-fade",
  scale: "clyro-reveal-scale",
};

/**
 * Revela o conteúdo quando ele entra na viewport. O deslocamento e a transição
 * vivem nas classes `clyro-reveal*`; aqui só adicionamos `is-revealed` uma vez.
 * `delay` escalona itens irmãos — a lista inteira acomoda em cascata.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      element.classList.add("is-revealed");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        element.classList.add("is-revealed");
        observer.disconnect();
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(VARIANT_CLASS[variant], className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
