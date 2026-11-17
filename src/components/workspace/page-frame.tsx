import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A moldura cinza das páginas do workspace. Ocupa a altura toda até o rodapé
 * da janela e o conteúdo rola por dentro, então a página não muda de tamanho:
 * só ganha o fundo. A ligação fica de fora, sem moldura.
 */
export function PageFrame({
  children,
  className,
  scroll = false,
}: {
  children: ReactNode;
  className?: string;
  /** Rola por dentro com o respiro padrão, para quem não tem a própria rolagem. */
  scroll?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1 sm:px-5 sm:pb-5 lg:pl-0 lg:pr-5">
      <div className={cn("ws-frame flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
        {scroll ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4 clyro-scroll sm:p-6">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
