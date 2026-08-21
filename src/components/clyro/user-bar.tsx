import { useState } from "react";
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { STATUS_LABEL, type PresenceStatus } from "@/lib/clyro-types";
import { StatusDot, UserAvatar } from "./primitives";

export function UserBar({
  muted,
  deafened,
  inVoice,
  onToggleMute,
  onToggleDeafen,
}: {
  muted: boolean;
  deafened: boolean;
  inVoice: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
}) {
  const { profile, signOut, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [activity, setActivity] = useState(profile?.activity ?? "");

  const setStatus = async (status: PresenceStatus) => {
    if (!profile) return;
    await supabase.from("profiles").update({ status }).eq("id", profile.id);
    await refreshProfile();
  };

  const saveProfile = async () => {
    if (!profile) return;
    await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || profile.username,
        avatar_url: avatarUrl.trim() || null,
        activity: activity.trim() || null,
      })
      .eq("id", profile.id);
    await refreshProfile();
    setOpen(false);
    toast.success("Perfil atualizado.");
  };

  return (
    <div className="flex items-center gap-2 border-t border-border bg-panel px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-accent"
          >
            <UserAvatar profile={profile ?? undefined} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {profile?.display_name || profile?.username}
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <StatusDot status={profile?.status} className="h-2 w-2" />
                {profile ? STATUS_LABEL[profile.status] : ""}
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
            <Settings size={14} /> Editar perfil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut size={14} /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}
        onClick={onToggleMute}
        disabled={!inVoice}
      >
        {muted ? <MicOff size={16} /> : <Mic size={16} />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={deafened ? "Ativar áudio" : "Ficar surdo"}
        onClick={onToggleDeafen}
        disabled={!inVoice}
      >
        {deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seu perfil</DialogTitle>
            <DialogDescription>
              @{profile?.username} — compartilhe esse nome de usuário para receber pedidos de amizade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Nome de exibição</Label>
              <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="avatar">URL do avatar</Label>
              <Input
                id="avatar"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="activity">Atividade atual</Label>
              <Input
                id="activity"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="Codando o Clyro"
              />
            </div>
            <Button className="w-full" onClick={() => void saveProfile()}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
