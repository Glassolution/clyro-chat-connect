import { useState } from "react";
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, LogOut, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { setMediaSetting, useMediaSettings } from "@/lib/media-settings";
import { STATUS_LABEL, type PresenceStatus } from "@/lib/clyro-types";
import { StatusDot, UserAvatar } from "./primitives";
import { SettingsDialog } from "./settings-dialog";

export function UserBar({
  muted,
  deafened,
  inVoice,
  speaking = false,
  onToggleMute,
  onToggleDeafen,
}: {
  muted: boolean;
  deafened: boolean;
  inVoice: boolean;
  /** Você está falando agora: acende o próprio avatar e a bola de status. */
  speaking?: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}) {
  const { profile, signOut, refreshProfile } = useAuth();
  const audio = useMediaSettings();
  const [open, setOpen] = useState(false);

  const setStatus = async (status: PresenceStatus) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ status }).eq("id", profile.id);
    if (error) {
      toast.error("Não foi possível mudar seu status.");
      return;
    }
    await refreshProfile();
  };

  return (
    <div className="flex items-center gap-2 border-t border-border bg-panel px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-accent"
          >
            <UserAvatar profile={profile ?? undefined} size={32} speaking={speaking} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {profile?.display_name || profile?.username}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <StatusDot status={profile?.status} speaking={speaking} className="h-2 w-2" />
                {speaking ? "Falando" : profile ? STATUS_LABEL[profile.status] : ""}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {(Object.keys(STATUS_LABEL) as PresenceStatus[]).map((status) => (
            <DropdownMenuItem key={status} onClick={() => void setStatus(status)}>
              <StatusDot status={status} className="h-2.5 w-2.5" />
              {STATUS_LABEL[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen(true)}>
            <Settings size={14} /> Configurações
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut size={14} /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/*
        Mutar/ensurdecer com a seta ao lado abrindo o menu de áudio, como no
        Discord — o toggle continua num clique só, sem menu no caminho.
      */}
      <VoiceToggle
        label={muted ? "Ativar microfone" : "Silenciar microfone"}
        danger={muted}
        disabled={!inVoice}
        onClick={onToggleMute}
        icon={muted ? <MicOff size={17} /> : <Mic size={17} />}
        menu={
          <>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
              Entrada de voz
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={audio.noiseSuppression}
              onCheckedChange={(checked) => setMediaSetting("noiseSuppression", checked)}
            >
              Supressão de ruído
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={audio.echoCancellation}
              onCheckedChange={(checked) => setMediaSetting("echoCancellation", checked)}
            >
              Cancelamento de eco
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={audio.autoGainControl}
              onCheckedChange={(checked) => setMediaSetting("autoGainControl", checked)}
            >
              Volume automático
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <Settings size={14} /> Configurações de voz
            </DropdownMenuItem>
          </>
        }
      />

      <VoiceToggle
        label={deafened ? "Ativar áudio" : "Ficar surdo"}
        danger={deafened}
        disabled={!inVoice}
        onClick={onToggleDeafen}
        icon={deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />}
        menu={
          <>
            <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
              Saída de áudio
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setOpen(true)}>
              <Settings size={14} /> Configurações de voz
            </DropdownMenuItem>
          </>
        }
      />

      <Button
        variant="ghost"
        size="icon"
        aria-label="Configurações"
        title="Configurações"
        onClick={() => setOpen(true)}
      >
        <Settings size={17} />
      </Button>

      <SettingsDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/**
 * Botão de duas partes: o corpo alterna o estado num clique, a seta abre o menu
 * de dispositivo. Ficam colados para ler como um controle só.
 */
function VoiceToggle({
  label,
  icon,
  danger,
  disabled,
  onClick,
  menu,
}: {
  label: string;
  icon: React.ReactNode;
  danger: boolean;
  disabled: boolean;
  onClick: () => void;
  menu: React.ReactNode;
}) {
  return (
    <span className="flex items-center">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-l text-muted-foreground transition-colors duration-100 hover:bg-[var(--color-muted)] hover:text-foreground disabled:opacity-40",
          danger && "bg-destructive/15 text-destructive hover:bg-destructive/25",
        )}
      >
        {icon}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${label} — opções`}
            className={cn(
              "flex h-8 w-4 items-center justify-center rounded-r text-muted-foreground transition-colors duration-100 hover:bg-[var(--color-muted)] hover:text-foreground",
              danger && "bg-destructive/15 text-destructive hover:bg-destructive/25",
            )}
          >
            <ChevronDown size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
