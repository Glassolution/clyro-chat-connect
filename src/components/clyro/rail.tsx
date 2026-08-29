import { useState } from "react";
import { Plus, Hash, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ClyroMark } from "./primitives";
import { CreateServerFlow } from "./create-server-flow";
import { initialsOf, type Server } from "@/lib/clyro-types";

export function ServerRail({
  servers,
  activeServerId,
  homeActive,
  discoverActive,
  onHome,
  onDiscover,
  onSelectServer,
  onChanged,
  userId,
}: {
  servers: Server[];
  activeServerId: string | null;
  homeActive: boolean;
  discoverActive: boolean;
  onHome: () => void;
  onDiscover: () => void;
  onSelectServer: (id: string) => void;
  onChanged: () => void;
  userId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3 text-rail-foreground">
      <RailButton variant="plain" active={homeActive} onClick={onHome} label="Mensagens diretas">
        <ClyroMark className="h-7 w-7 text-rail-foreground" glyphClassName="text-rail" />
      </RailButton>
      <RailButton variant="plain" active={discoverActive} onClick={onDiscover} label="Comunidades">
        <Search size={20} />
      </RailButton>
      <span className="my-1 h-px w-8 bg-rail-foreground/15" />
      <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto clyro-scroll">
        {servers.map((server) => (
          <RailButton
            key={server.id}
            active={activeServerId === server.id}
            onClick={() => onSelectServer(server.id)}
            label={server.name}
          >
            {server.icon_url ? (
              <img src={server.icon_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-semibold">
                {initialsOf(server.name) || <Hash size={16} />}
              </span>
            )}
          </RailButton>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[24px] border border-dashed border-online/40 bg-card text-online transition-all duration-200 ease-clyro hover:rounded-2xl hover:border-online hover:bg-online hover:text-rail"
              aria-label="Adicionar servidor"
            >
              <Plus size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Adicionar servidor</TooltipContent>
        </Tooltip>

        <CreateServerFlow
          open={open}
          onOpenChange={setOpen}
          userId={userId}
          onCreated={(id) => {
            onChanged();
            onSelectServer(id);
          }}
          onJoined={(id) => {
            onChanged();
            onSelectServer(id);
          }}
        />
      </div>
    </nav>
  );
}

function RailButton({
  active,
  onClick,
  label,
  children,
  /** `plain` mantém o quadrado neutro no estado ativo — sem inverter para branco. */
  variant = "fill",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  variant?: "fill" | "plain";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="group relative flex h-12 w-full shrink-0 items-center justify-center"
        >
          {/* Pilha de seleção: fica na borda do rail, por isso mora fora do quadrado
              recortado — dentro dele o overflow-hidden do avatar a cortava. */}
          <span
            aria-hidden
            className={cn(
              "absolute left-0 w-1 rounded-r-full bg-rail-foreground transition-all",
              active ? "h-6" : "h-2 opacity-0 group-hover:opacity-100",
            )}
          />
          <span
            className={cn(
              "flex h-12 w-12 items-center justify-center overflow-hidden rounded-[24px] bg-card text-rail-foreground transition-all duration-200 ease-clyro group-hover:rounded-2xl group-hover:bg-primary group-hover:text-primary-foreground",
              active && variant === "fill" && "rounded-2xl bg-primary text-primary-foreground",
              active && variant === "plain" && "rounded-2xl bg-primary text-primary-foreground",
            )}
          >
            {children}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
