import { Plus } from "@/components/icons";
import { cn } from "@/lib/utils";
import { initialsOf, type Server } from "@/lib/clyro-types";
import { MediaImage } from "@/components/clyro/primitives";

/**
 * Faixa do topo: cada workspace é uma pílula com o ícone num círculo; o aberto
 * fica preto. O último botão cria ou entra num workspace novo.
 */
export function WorkspaceTabs({
  title,
  workspaces,
  activeId,
  onSelect,
  onCreate,
  trailing,
}: {
  title: string;
  workspaces: Server[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-4 px-5 pb-4 pt-6 sm:gap-6 sm:px-8">
      <h1 className="hidden shrink-0 text-xl font-semibold tracking-tight md:block">{title}</h1>
      <div className="clyro-scroll -my-2 flex min-w-0 flex-1 items-center gap-3 overflow-x-auto px-1 py-2">
        {workspaces.map((ws) => {
          const active = ws.id === activeId;
          return (
            <button
              key={ws.id}
              type="button"
              data-active={active}
              onClick={() => onSelect(ws.id)}
              className={cn("ws-pill shrink-0 text-[15px]", !active && "hover:bg-accent")}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
                  active ? "bg-primary-foreground/15" : "bg-secondary",
                )}
              >
                {ws.icon_url ? (
                  <MediaImage src={ws.icon_url} className="h-full w-full object-cover" />
                ) : (
                  initialsOf(ws.name)
                )}
              </span>
              <span className="max-w-[12rem] truncate">{ws.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onCreate}
          className="ws-pill shrink-0 border-dashed text-[15px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Plus size={18} />
          </span>
          Novo workspace
        </button>
      </div>
      {trailing}
    </header>
  );
}
