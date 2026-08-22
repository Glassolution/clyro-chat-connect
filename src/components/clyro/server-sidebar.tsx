import { useState } from "react";
import { Hash, Volume2, Plus, Copy, MonitorUp, MicOff, HeadphoneOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useProfiles, useVoiceStates } from "@/lib/clyro-queries";
import type { Channel, Selection, Server } from "@/lib/clyro-types";
import { UserAvatar } from "./primitives";

export function ServerSidebar({
  server,
  channels,
  selection,
  onSelect,
  onOpenVoice,
  onSelectProfile,
  activeVoiceChannelId,
  footer,
}: {
  server: Server;
  channels: Channel[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onOpenVoice: (channel: Channel) => void;
  onSelectProfile: (userId: string) => void;
  activeVoiceChannelId: string | null;
  footer: React.ReactNode;
}) {
  const { data: profiles } = useProfiles();
  const { data: voiceStates = [] } = useVoiceStates();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");

  const createChannel = async () => {
    if (!name.trim()) return;
    const { error } = await supabase.from("channels").insert({
      server_id: server.id,
      name: name.trim().toLowerCase().replace(/\s+/g, "-"),
      kind,
      position: channels.length,
    });
    if (error) {
      toast.error("Não foi possível criar o canal.");
      return;
    }
    setName("");
    setOpen(false);
  };

  const textChannels = channels.filter((c) => c.kind === "text");
  const voiceChannels = channels.filter((c) => c.kind === "voice");

  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-panel">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="truncate text-sm font-semibold">{server.name}</span>
        <button
          type="button"
          aria-label="Copiar convite"
          onClick={() => {
            void navigator.clipboard.writeText(server.invite_code);
            toast.success(`Convite copiado: ${server.invite_code}`);
          }}
          className="text-muted-foreground transition hover:text-foreground"
        >
          <Copy size={14} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto clyro-scroll px-2 py-3">
        <Group
          label="Canais de texto"
          onAdd={() => {
            setKind("text");
            setOpen(true);
          }}
        >
          {textChannels.map((channel) => (
            <ChannelButton
              key={channel.id}
              icon={<Hash size={15} />}
              name={channel.name}
              active={selection.kind === "channel" && selection.channelId === channel.id}
              onClick={() =>
                onSelect({ kind: "channel", serverId: server.id, channelId: channel.id })
              }
            />
          ))}
        </Group>

        <Group
          label="Canais de voz"
          onAdd={() => {
            setKind("voice");
            setOpen(true);
          }}
        >
          {voiceChannels.map((channel) => {
            // voice_states é legível por todos, então quem está de fora da call
            // enxerga a mesma lista de quem está dentro.
            const members = voiceStates.filter((v) => v.channel_id === channel.id);
            const connected = activeVoiceChannelId === channel.id;
            return (
              <div key={channel.id}>
                <ChannelButton
                  icon={<Volume2 size={15} className={cn(members.length > 0 && "text-online")} />}
                  name={channel.name}
                  active={selection.kind === "voice" && selection.channelId === channel.id}
                  onClick={() => onOpenVoice(channel)}
                  trailing={
                    members.length > 0 ? (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {members.length}
                      </span>
                    ) : null
                  }
                />
                {members.length > 0 && (
                  <ul className="ml-4 space-y-0.5 border-l border-border py-1 pl-2">
                    {members.map((member) => {
                      const profile = profiles?.get(member.user_id);
                      return (
                        <li key={member.user_id} className="clyro-fade-in">
                          <button
                            type="button"
                            onClick={() => onSelectProfile(member.user_id)}
                            title="Ver perfil"
                            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent"
                          >
                            <UserAvatar profile={profile} size={20} showStatus={false} />
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {profile?.display_name || profile?.username || "Participante"}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                              {member.sharing_screen && <MonitorUp size={11} />}
                              {member.deafened ? (
                                <HeadphoneOff size={11} className="text-destructive" />
                              ) : (
                                member.muted && <MicOff size={11} className="text-destructive" />
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {connected && members.length === 0 && (
                  <p className="ml-6 py-1 text-[11px] text-muted-foreground">Conectando…</p>
                )}
              </div>
            );
          })}
        </Group>
      </div>
      {footer}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo canal</DialogTitle>
            <DialogDescription>Canais de texto conversam, canais de voz falam.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Tabs value={kind} onValueChange={(value) => setKind(value as "text" | "voice")}>
              <TabsList className="w-full">
                <TabsTrigger value="text" className="flex-1">
                  Texto
                </TabsTrigger>
                <TabsTrigger value="voice" className="flex-1">
                  Voz
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-1.5">
              <Label htmlFor="channel-name">Nome do canal</Label>
              <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => void createChannel()}>
              Criar canal
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Group({
  label,
  onAdd,
  children,
}: {
  label: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Criar ${label.toLowerCase()}`}
          className="text-muted-foreground transition hover:text-foreground"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ChannelButton({
  icon,
  name,
  active,
  onClick,
  trailing,
}: {
  icon: React.ReactNode;
  name: string;
  active: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {trailing}
    </button>
  );
}
