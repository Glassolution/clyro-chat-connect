import { useState } from "react";
import {
  Hash,
  Volume2,
  Plus,
  Copy,
  MonitorUp,
  MicOff,
  HeadphoneOff,
  ChevronDown,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-panel">
      <header className="flex h-16 items-center border-b border-border px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-200 hover:bg-accent"
            >
              <span className="truncate text-[15px] font-semibold">{server.name}</span>
              <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(server.invite_code);
                toast.success(`Convite copiado: ${server.invite_code}`);
              }}
            >
              <Copy size={14} /> Copiar convite
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setKind("text");
                setOpen(true);
              }}
            >
              <Plus size={14} /> Criar canal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="clyro-scroll flex-1 overflow-y-auto px-3 py-4">
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

        <button
          type="button"
          onClick={() => {
            setKind("text");
            setOpen(true);
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground"
        >
          <Plus size={15} /> Criar canal
        </button>
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
  const [open, setOpen] = useState(true);

  return (
    <section className="mb-5">
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ChevronDown
            size={13}
            className={cn(
              "shrink-0 transition-transform duration-300 ease-clyro",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Criar ${label.toLowerCase()}`}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
        >
          <Plus size={14} />
        </button>
      </div>
      {/* abre por altura: nada aparece de estalo */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-clyro",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 space-y-0.5 overflow-hidden">{children}</div>
      </div>
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
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {trailing}
    </button>
  );
}
