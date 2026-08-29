import { useEffect, useRef, useState } from "react";
import {
  Hash,
  Volume2,
  Plus,
  Copy,
  MonitorUp,
  MicOff,
  HeadphoneOff,
  ChevronDown,
  FolderPlus,
  ImagePlus,
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useChannelCategories, useProfiles, useVoiceStates } from "@/lib/clyro-queries";
import type { Channel, ChannelCategory, Selection, Server } from "@/lib/clyro-types";
import { resignLegacyUrl, uploadProfileImage } from "@/lib/profile-media";
import { UserAvatar } from "./primitives";

export function ServerSidebar({
  server,
  channels,
  selection,
  onSelect,
  onOpenVoice,
  onSelectProfile,
  activeVoiceChannelId,
  speakingUserIds = [],
  currentUserId,
  onIconChanged,
  footer,
}: {
  server: Server;
  channels: Channel[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onOpenVoice: (channel: Channel) => void;
  onSelectProfile: (userId: string) => void;
  activeVoiceChannelId: string | null;
  /** Ids de quem está falando agora, para acender a bola verde na lista. */
  speakingUserIds?: string[];
  currentUserId: string;
  onIconChanged: () => void;
  footer: React.ReactNode;
}) {
  const { data: profiles } = useProfiles();
  const { data: voiceStates = [] } = useVoiceStates();
  const { data: categories = [] } = useChannelCategories(server.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  /** Categoria em que o canal novo vai nascer — o "+" do cabeçalho define isto. */
  const [targetCategory, setTargetCategory] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const iconRef = useRef<HTMLInputElement>(null);
  const isOwner = server.owner_id === currentUserId;

  // Ícone gravado quando o bucket ainda era público: o dono reassina na
  // primeira visita e o servidor volta a aparecer com imagem para todo mundo.
  useEffect(() => {
    if (!isOwner || !server.icon_url) return;
    let cancelled = false;
    void resignLegacyUrl(server.icon_url).then(async (url) => {
      if (!url || cancelled) return;
      const { error } = await supabase
        .from("servers")
        .update({ icon_url: url })
        .eq("id", server.id);
      if (!error) onIconChanged();
    });
    return () => {
      cancelled = true;
    };
  }, [isOwner, server.icon_url, server.id, onIconChanged]);

  /**
   * Mesmo caminho do ícone no fluxo de criação: bucket privado, pasta do
   * próprio usuário, link assinado guardado no servidor.
   */
  const uploadIcon = async (file: File) => {
    const result = await uploadProfileImage(currentUserId, file, `server-${server.id}`);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { error } = await supabase
      .from("servers")
      .update({ icon_url: result.url })
      .eq("id", server.id);
    if (error) {
      toast.error("Não foi possível salvar o ícone.");
      return;
    }
    onIconChanged();
    toast.success("Ícone atualizado.");
  };

  const openChannelDialog = (channelKind: "text" | "voice", categoryId: string | null) => {
    setKind(channelKind);
    setTargetCategory(categoryId);
    setOpen(true);
  };

  const createCategory = async () => {
    const trimmed = categoryName.trim();
    if (!trimmed) return;
    const client = supabase as unknown as {
      from: (table: string) => {
        insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    };
    const { error } = await client.from("channel_categories").insert({
      server_id: server.id,
      name: trimmed,
      position: categories.length,
    });
    if (error) {
      toast.error(
        /channel_categories/i.test(error.message)
          ? "As categorias ainda não existem no banco. Aplique a migração channel_categories."
          : "Não foi possível criar a categoria.",
      );
      return;
    }
    setCategoryName("");
    setCategoryOpen(false);
    toast.success("Categoria criada.");
  };

  /** Mover é só trocar o category_id — null devolve o canal aos grupos padrão. */
  const moveChannel = async (channelId: string, categoryId: string | null) => {
    const client = supabase as unknown as {
      from: (table: string) => {
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: unknown }>;
        };
      };
    };
    const { error } = await client
      .from("channels")
      .update({ category_id: categoryId })
      .eq("id", channelId);
    if (error) toast.error("Não foi possível mover o canal.");
  };

  const createChannel = async () => {
    if (!name.trim()) return;
    const client = supabase as unknown as {
      from: (table: string) => {
        insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    };
    const { error } = await client.from("channels").insert({
      server_id: server.id,
      name: name.trim().toLowerCase().replace(/\s+/g, "-"),
      kind,
      position: channels.length,
      category_id: targetCategory,
    });
    if (error) {
      toast.error("Não foi possível criar o canal.");
      return;
    }
    setName("");
    setOpen(false);
  };

  // Canal sem categoria continua nos grupos padrão — servidores antigos seguem
  // funcionando sem precisar de nenhuma migração de dados.
  const loose = channels.filter((c) => !c.category_id);
  const textChannels = loose.filter((c) => c.kind === "text");
  const voiceChannels = loose.filter((c) => c.kind === "voice");

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-panel">
      <header className="flex h-16 items-center border-b border-border px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded px-2 py-1.5 text-left transition-colors duration-100 hover:bg-[var(--color-muted)]"
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
            <DropdownMenuItem onClick={() => openChannelDialog("text", null)}>
              <Plus size={14} /> Criar canal
            </DropdownMenuItem>
            {isOwner && (
              <>
                <DropdownMenuItem onClick={() => setCategoryOpen(true)}>
                  <FolderPlus size={14} /> Criar categoria
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => iconRef.current?.click()}>
                  <ImagePlus size={14} /> Alterar ícone
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={iconRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadIcon(file);
            event.target.value = "";
          }}
        />
      </header>

      <div className="clyro-scroll flex-1 overflow-y-auto px-3 py-4">
        {/* categorias do dono primeiro, cada uma com seus próprios canais */}
        {categories.map((category) => {
          const inside = channels.filter((c) => c.category_id === category.id);
          return (
            <Group
              key={category.id}
              label={category.name}
              onAdd={() => openChannelDialog("text", category.id)}
            >
              {inside.map((channel) => (
                <ChannelContextMenu
                  key={channel.id}
                  categories={categories}
                  currentCategoryId={channel.category_id}
                  canMove={isOwner}
                  onMove={(target) => void moveChannel(channel.id, target)}
                >
                  <ChannelButton
                    icon={
                      channel.kind === "voice" ? (
                        <Volume2
                          size={15}
                          className={cn(
                            voiceStates.some((v) => v.channel_id === channel.id) && "text-online",
                          )}
                        />
                      ) : (
                        <Hash size={15} />
                      )
                    }
                    name={channel.name}
                    active={
                      (selection.kind === "channel" || selection.kind === "voice") &&
                      selection.channelId === channel.id
                    }
                    onClick={() =>
                      channel.kind === "voice"
                        ? onOpenVoice(channel)
                        : onSelect({ kind: "channel", serverId: server.id, channelId: channel.id })
                    }
                  />
                </ChannelContextMenu>
              ))}
              {inside.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Categoria vazia.</p>
              )}
            </Group>
          );
        })}

        <Group label="Canais de texto" onAdd={() => openChannelDialog("text", null)}>
          {textChannels.map((channel) => (
            <ChannelContextMenu
              key={channel.id}
              categories={categories}
              currentCategoryId={channel.category_id}
              canMove={isOwner}
              onMove={(target) => void moveChannel(channel.id, target)}
            >
              <ChannelButton
                icon={<Hash size={15} />}
                name={channel.name}
                active={selection.kind === "channel" && selection.channelId === channel.id}
                onClick={() =>
                  onSelect({ kind: "channel", serverId: server.id, channelId: channel.id })
                }
              />
            </ChannelContextMenu>
          ))}
        </Group>

        <Group label="Canais de voz" onAdd={() => openChannelDialog("voice", null)}>
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
                            <UserAvatar
                              profile={profile}
                              size={20}
                              speaking={speakingUserIds.includes(member.user_id)}
                            />
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
          onClick={() => openChannelDialog("text", null)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors duration-100 hover:border-foreground/30 hover:text-foreground"
        >
          <Plus size={15} /> Criar canal
        </button>

        {isOwner && (
          <button
            type="button"
            onClick={() => setCategoryOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors duration-100 hover:border-foreground/30 hover:text-foreground"
          >
            <FolderPlus size={15} /> Criar categoria
          </button>
        )}
      </div>
      {footer}

      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>
              Uma seção nomeada para agrupar canais — por exemplo “Social” ou “Empresas”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Nome da categoria</Label>
              <Input
                id="category-name"
                value={categoryName}
                autoFocus
                placeholder="Social"
                onChange={(event) => setCategoryName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void createCategory()}
              />
            </div>
            <Button
              className="w-full"
              disabled={!categoryName.trim()}
              onClick={() => void createCategory()}
            >
              Criar categoria
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    <section className="group/group mb-5">
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
          aria-label={`Criar canal em ${label.toLowerCase()}`}
          title={`Criar canal em ${label}`}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,color] duration-150 focus-visible:opacity-100 group-hover/group:opacity-100 hover:text-foreground"
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
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[15px] text-muted-foreground transition-colors duration-100 hover:bg-[var(--color-muted)] hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {trailing}
    </button>
  );
}

/**
 * Botão direito no canal abre o menu de mover. Só o dono vê as opções — para os
 * demais o menu simplesmente não envolve nada.
 */
function ChannelContextMenu({
  categories,
  currentCategoryId,
  canMove,
  onMove,
  children,
}: {
  categories: ChannelCategory[];
  currentCategoryId: string | null;
  canMove: boolean;
  onMove: (categoryId: string | null) => void;
  children: React.ReactNode;
}) {
  if (!canMove || categories.length === 0) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
          Mover para
        </ContextMenuLabel>
        <ContextMenuSeparator />
        {categories.map((category) => (
          <ContextMenuItem
            key={category.id}
            disabled={category.id === currentCategoryId}
            onClick={() => onMove(category.id)}
          >
            {category.name}
          </ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!currentCategoryId} onClick={() => onMove(null)}>
          Sem categoria
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
