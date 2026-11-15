import { createElement, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const inViewport = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
};

/**
 * Liga as revelações ao rolar. Roda depois dos efeitos dos filhos, então quem
 * já está na tela foi marcado antes de a página passar a esconder o resto.
 */
export function useMotionReady() {
  useEffect(() => {
    document.documentElement.classList.add("motion-ready");
  }, []);
}

/**
 * Bloco que entra uma vez quando aparece na tela. `i` é a posição na lista,
 * para o atraso em cascata (limitado no CSS a 6 passos).
 */
export function Reveal({
  as = "div",
  i = 0,
  className,
  style,
  children,
  ...rest
}: {
  as?: "div" | "article" | "section" | "li";
  i?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "style" | "children">) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inViewport(el)) {
      el.setAttribute("data-inview", "true");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.setAttribute("data-inview", "true");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: cn("reveal", className),
      style: { ...style, "--i": i } as React.CSSProperties,
    },
    children,
  );
}

/**
 * Se o elemento está na tela agora. Com `once`, vira verdadeiro uma vez e
 * fica; sem, acompanha a rolagem (para pausar loops fora da tela).
 */
export function useInView<T extends Element>({
  once = false,
  threshold = 0.4,
}: { once?: boolean; threshold?: number } = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const hit = Boolean(entry?.isIntersecting);
        setInView(hit);
        if (hit && once) io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);
  return [ref, inView] as const;
}

/** Quem pediu menos movimento no sistema. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
