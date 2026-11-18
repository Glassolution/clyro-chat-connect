import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Monitor, AppWindow } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  desktopBridge,
  isDesktopPath,
  type DesktopPickRequest,
  type DesktopSource,
} from "@/lib/desktop";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * O que só existe dentro do aplicativo: a barra de título arrastável, o
 * desvio das páginas do site que o app não tem e a escolha do que
 * compartilhar na call. Fora do app não desenha nada.
 */
export function DesktopShell() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(desktopBridge() !== null), []);
  if (!desktop) return null;
  return (
    <>
      <div aria-hidden="true" className="clyro-titlebar" />
      <DesktopRouteGuard />
      <SourcePicker />
    </>
  );
}

/** A vitrine e as páginas de marketing ficam no site: no app, vai para o workspace. */
function DesktopRouteGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    if (!isDesktopPath(pathname)) void navigate({ to: "/app", replace: true });
  }, [pathname, navigate]);
  return null;
}

/** O seletor de tela e janela do app, no lugar do que o navegador mostraria. */
function SourcePicker() {
  const [request, setRequest] = useState<DesktopPickRequest | null>(null);
  const [tab, setTab] = useState<DesktopSource["kind"]>("window");
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    return bridge.onPickSource((req) => {
      setRequest(req);
      setChosen(null);
      setTab(req.sources.some((s) => s.kind === "window") ? "window" : "screen");
    });
  }, []);

  const answer = (sourceId: string | null) => {
    if (request) desktopBridge()?.answerPick(request.requestId, sourceId);
    setRequest(null);
  };

  const sources = request?.sources.filter((s) => s.kind === tab) ?? [];
  const screens = request?.sources.filter((s) => s.kind === "screen").length ?? 0;
  const windows = request?.sources.filter((s) => s.kind === "window").length ?? 0;

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && answer(null)}>
      <DialogContent className="max-w-[760px] gap-0 p-0">
        <div className="px-6 pb-4 pt-6">
          <DialogTitle className="text-[19px] font-semibold tracking-[-0.02em]">
            O que você quer compartilhar?
          </DialogTitle>
          <DialogDescription className="mt-1 text-[14px]">
            Quem está na call vê só o que você escolher aqui.
          </DialogDescription>
          <div role="tablist" className="mt-5 inline-flex rounded-full bg-secondary p-1">
            {(
              [
                { id: "window", label: "Janelas", count: windows, icon: AppWindow },
                { id: "screen", label: "Telas", count: screens, icon: Monitor },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                disabled={t.count === 0}
                onClick={() => {
                  setTab(t.id);
                  setChosen(null);
                }}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-200 ease-clyro disabled:opacity-40",
                  tab === t.id
                    ? "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto px-6 pb-2 clyro-scroll sm:grid-cols-3">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setChosen(s.id)}
              onDoubleClick={() => answer(s.id)}
              aria-pressed={chosen === s.id}
              className={cn(
                "group flex flex-col gap-2 rounded-[16px] p-2 text-left outline-none transition-[background-color,box-shadow] duration-200 ease-clyro focus-visible:ring-2 focus-visible:ring-brand",
                chosen === s.id
                  ? "bg-brand-soft shadow-[0_0_0_1.5px_var(--brand)]"
                  : "hover:bg-secondary",
              )}
            >
              <span className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-[10px] bg-secondary">
                {s.thumbnail ? (
                  <img src={s.thumbnail} alt="" className="h-full w-full object-contain" />
                ) : s.kind === "window" ? (
                  <AppWindow className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <Monitor className="h-6 w-6 text-muted-foreground" />
                )}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 px-0.5">
                {s.icon && <img src={s.icon} alt="" className="h-4 w-4 shrink-0" />}
                <span className="truncate text-[13px] font-medium">{s.name}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-foreground/[0.06] px-6 py-4">
          <Button variant="ghost" className="rounded-full" onClick={() => answer(null)}>
            Cancelar
          </Button>
          <Button
            className="rounded-full bg-brand px-5 text-white hover:bg-brand/90"
            disabled={!chosen}
            onClick={() => answer(chosen)}
          >
            Compartilhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
