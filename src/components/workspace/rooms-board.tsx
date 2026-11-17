import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Add,
  ArrowDown2,
  ArrowRight,
  Clock,
  Hashtag,
  InfoCircle,
  Link21,
  Lock1,
  Message,
  Microphone2,
  Play,
  Setting4,
  TickCircle,
  Unlock,
  CloseCircle,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVoiceStates } from "@/lib/voice-presence";
import type { Channel, Message as ChatMessage, Profile, Server } from "@/lib/clyro-types";
import type { WorkspaceMember } from "@/lib/workspace-queries";
import {
  canEnterRoom,
  canManageRoom,
  DEFAULT_ROOM_NAME,
  isCreatedRoom,
  useRecentRoomMessages,
  useRoomActions,
  type RoomAccess,
  type RoomSettings,
  type RoomsData,
} from "@/lib/room-queries";
import { UserAvatar } from "@/components/clyro/primitives";
import { AvatarStack } from "./team-panel";
import { Mascot } from "./mascot";
import { WorkspaceIcon } from "./workspace-sidebar";

type Filter = "all" | "live" | "open" | "locked" | "mine";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Salas" },
  { id: "live", label: "Ao vivo" },
  { id: "open", label: "Abertas" },
  { id: "locked", label: "Com pedido" },
  { id: "mine", label: "Criadas por você" },
];

/** Laranja claro dos cadeados (o laranja da marca a meia força, sobre branco). */
const LOCK_TONE = "#ffb489";

/** Alturas da onda, fixas para o desenho não pular a cada render. */
const WAVE = [6, 12, 18, 10, 22, 14, 8, 16, 24, 12, 6, 14, 20, 10, 16, 8, 12, 18];

function nameOf(p: Profile | undefined) {
  return p?.display_name || p?.username || "Alguém";
}

function firstName(p: Profile | undefined) {
  return nameOf(p).split(" ")[0];
}

/** 15:28 ou 1:05:12, contado desde quem entrou primeiro. */
function elapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function ago(iso: string, now: number) {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function useSecondClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/**
 * A aba Salas: cada sala é um cartão com quem está lá, há quanto tempo a call
 * rola, a conversa recente e a porta — entrar direto ou pedir para entrar.
 * Qualquer pessoa do time abre uma sala nova.
 */
export function RoomsBoard({
  workspace,
  channels,
  members,
  profiles,
  userId,
  isAdmin,
  rooms,
  expired,
  currentChannelId,
  onEnter,
  onOpenText,
}: {
  workspace: Server;
  channels: Channel[];
  members: WorkspaceMember[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  isAdmin: boolean;
  rooms: RoomsData;
  /** Salas vazias há mais de 2 minutos: somem da grade. */
  expired: Set<string>;
  /** A sala de voz em que você está agora, se estiver. */
  currentChannelId: string | null;
  onEnter: (channel: Channel) => void;
  onOpenText: (channelId: string) => void;
}) {
  const states = useVoiceStates();
  const actions = useRoomActions(workspace.id, userId);
  const [filter, setFilter] = useState<Filter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);

  // Só aparecem as salas que alguém abriu; a sala de voz que vem com o
  // workspace fica de fora.
  const voice = useMemo(
    () => channels.filter((c) => isCreatedRoom(c, channels, rooms) && !expired.has(c.id)),
    [channels, rooms, expired],
  );
  const text = useMemo(() => channels.filter((c) => c.kind === "text"), [channels]);
  const { data: recent } = useRecentRoomMessages(voice.map((c) => c.id));

  const cards = useMemo(
    () =>
      voice
        .map((channel) => {
          const inside = states.filter((s) => s.channel_id === channel.id);
          const starts = inside
            .map((s) => (s.joined_at ? new Date(s.joined_at).getTime() : NaN))
            .filter((n) => !Number.isNaN(n));
          const settings = rooms.settings.get(channel.id);
          return {
            channel,
            settings,
            inside: inside.map((s) => s.user_id),
            since: starts.length ? Math.min(...starts) : null,
            access: rooms.access.filter((a) => a.channel_id === channel.id),
            canEnter: canEnterRoom(rooms, channel.id, userId, isAdmin),
            canManage: canManageRoom(rooms, channel.id, userId, isAdmin),
          };
        })
        // Ao vivo primeiro; depois a ordem que o time deu às salas.
        .sort((a, b) => b.inside.length - a.inside.length),
    [voice, states, rooms, userId, isAdmin],
  );

  const anyLive = cards.some((c) => c.inside.length > 0);
  const now = useSecondClock(anyLive);

  const matches = (c: (typeof cards)[number], f: Filter) =>
    f === "live"
      ? c.inside.length > 0
      : f === "open"
        ? !c.settings?.locked
        : f === "locked"
          ? !!c.settings?.locked
          : f === "mine"
            ? c.settings?.created_by === userId
            : true;
  const visible = cards.filter((c) => matches(c, filter));
  const label = FILTERS.find((f) => f.id === filter)?.label ?? "Salas";
  const share = cards.find((c) => c.channel.id === shareId) ?? null;

  const run = async (job: () => Promise<void>, ok: string) => {
    try {
      await job();
      toast.success(ok);
    } catch {
      toast.error("Não deu certo agora. Tente de novo em instantes.");
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto clyro-scroll">
      <div className="flex flex-col gap-4 p-4 pb-8 sm:p-6">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-black/[0.09] bg-card px-3 text-[14px] font-medium tracking-[-0.01em] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_3px_8px_-6px_rgb(0_0_0/0.12)] outline-none transition-[border-color,transform] duration-200 ease-clyro hover:border-black/20 focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98] data-[state=open]:border-black/20"
              >
                <Hashtag size={16} color="var(--brand)" variant="Bold" className="shrink-0" />
                <span className="truncate">{label}</span>
                <span className="font-normal tabular-nums text-[#a3a3a3]">
                  {String(visible.length).padStart(2, "0")}
                </span>
                <ArrowDown2
                  size={13}
                  color="currentColor"
                  className="shrink-0 text-muted-foreground transition-transform duration-200 ease-clyro group-data-[state=open]:rotate-180"
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="w-56 rounded-[16px] p-1.5">
              {FILTERS.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onSelect={() => setFilter(f.id)}
                  className={cn(
                    "h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]",
                    filter === f.id && "font-medium",
                  )}
                >
                  <span className="flex-1">{f.id === "all" ? "Todas as salas" : f.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {cards.filter((c) => matches(c, f.id)).length}
                  </span>
                  {filter === f.id && (
                    <TickCircle
                      size={15}
                      color="var(--brand)"
                      variant="Bold"
                      className="shrink-0"
                    />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-foreground pl-3 pr-4 text-[13.5px] font-medium text-background outline-none transition-[opacity,transform] duration-200 ease-clyro hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Add size={18} color="currentColor" /> Nova sala
          </button>
        </div>

        {rooms.missing && (
          <p className="text-[12.5px] leading-[1.5] text-[#8a8a8a]">
            Por enquanto toda sala é aberta. Trancar e pedir para entrar chegam com a migração{" "}
            <span className="font-mono text-[12px]">room_access</span>.
          </p>
        )}

        {visible.length > 0 ? (
          <div className="flex flex-wrap items-start gap-4">
            {visible.map((card) => (
              <RoomCard
                key={card.channel.id}
                {...card}
                here={card.channel.id === currentChannelId}
                now={now}
                messages={recent?.get(card.channel.id) ?? []}
                profiles={profiles}
                userId={userId}
                lockable={!rooms.missing}
                onEnter={() => onEnter(card.channel)}
                onShare={() => setShareId(card.channel.id)}
                onRequest={() =>
                  void run(
                    () => actions.requestEntry(card.channel.id),
                    "Pedido enviado. Você recebe um aviso quando liberarem.",
                  )
                }
                onCancel={() =>
                  void run(() => actions.cancelRequest(card.channel.id), "Pedido cancelado.")
                }
              />
            ))}
          </div>
        ) : (
          <section className="flex w-full flex-col items-start gap-2 rounded-[20px] border border-black/[0.08] p-5 sm:w-[360px]">
            <Mascot pose="estrela" size={52} />
            <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em]">
              {filter === "all" ? "Nenhuma sala ainda" : "Nenhuma sala neste filtro"}
            </p>
            <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
              Uma sala é uma call que fica de pé: o time vê quem está lá e entra quando quiser.
            </p>
            {filter === "all" && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground pl-3 pr-4 text-[13.5px] font-medium text-background transition-opacity hover:opacity-90"
              >
                <Add size={18} color="currentColor" /> Abrir a primeira sala
              </button>
            )}
          </section>
        )}

        {text.length > 0 && (
          <section className="mt-2">
            <h2 className="text-[13px] font-medium text-muted-foreground">Canais de texto</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {text.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenText(c.id)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-card px-3.5 text-[13.5px] font-medium outline-none transition-[border-color,transform] duration-200 ease-clyro hover:border-black/20 focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]"
                >
                  <Hashtag size={15} color="currentColor" className="text-muted-foreground" />
                  {c.name}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <CreateRoomDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lockable={!rooms.missing}
        onCreate={async (input) => {
          const created = await actions.createRoom(input);
          setCreateOpen(false);
          toast.success(
            input.locked && !created.settingsSaved
              ? "Sala criada. Ela ficou aberta: falta a migração de acesso."
              : "Sala criada. Você já está nela.",
          );
          onEnter({
            id: created.id,
            server_id: workspace.id,
            name: created.name,
            kind: "voice",
            position: created.position,
            category_id: null,
          });
        }}
      />

      {share && (
        <RoomShareDialog
          open
          onOpenChange={(open) => !open && setShareId(null)}
          workspace={workspace}
          channel={share.channel}
          locked={!!share.settings?.locked}
          topic={share.settings?.topic ?? null}
          createdBy={share.settings?.created_by ?? null}
          canManage={share.canManage}
          lockable={!rooms.missing}
          inside={share.inside}
          access={share.access}
          members={members}
          profiles={profiles}
          now={now}
          onToggleLocked={(locked) =>
            void run(
              () => actions.saveSettings(share.channel.id, { locked }, !!share.settings),
              locked ? "Agora quem não tem acesso pede para entrar." : "Sala aberta para o time.",
            )
          }
          onDecide={(personId, approve) =>
            void run(
              () => actions.decide(share.channel.id, personId, approve),
              approve ? "Acesso liberado." : "Pedido recusado.",
            )
          }
          onRevoke={(personId) =>
            void run(() => actions.revoke(share.channel.id, personId), "Acesso removido.")
          }
        />
      )}
    </div>
  );
}

type Tab = "chat" | "about";

function RoomCard({
  channel,
  settings,
  inside,
  since,
  access,
  canEnter,
  canManage,
  here,
  now,
  messages,
  profiles,
  userId,
  lockable,
  onEnter,
  onShare,
  onRequest,
  onCancel,
}: {
  channel: Channel;
  settings: RoomSettings | undefined;
  inside: string[];
  since: number | null;
  access: RoomAccess[];
  canEnter: boolean;
  canManage: boolean;
  here: boolean;
  now: number;
  messages: ChatMessage[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  lockable: boolean;
  onEnter: () => void;
  onShare: () => void;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const locked = !!settings?.locked;
  const live = inside.length > 0;
  const creator = settings?.created_by ? profiles?.get(settings.created_by) : undefined;
  const mine = access.find((a) => a.user_id === userId);
  const pending = access.filter((a) => a.status === "pending");
  const approved = access.filter((a) => a.status === "approved").length;

  // A barra escura é a porta da sala: o que ela faz depende de quem você é.
  const door = here
    ? { label: "Você está aqui", icon: "play" as const, act: onEnter }
    : canEnter
      ? { label: live ? "Entrar" : "Começar", icon: "play" as const, act: onEnter }
      : mine?.status === "pending"
        ? { label: "Pedido enviado", icon: "clock" as const, act: onCancel }
        : {
            label: mine?.status === "denied" ? "Pedir de novo" : "Pedir para entrar",
            icon: "lock" as const,
            act: onRequest,
          };

  // Quem aparece na fileira de fotos: quem está lá; sala vazia mostra quem criou.
  const faces = live ? inside : settings?.created_by ? [settings.created_by] : [];
  const first = profiles?.get(inside[0] ?? "");
  const attendance = live
    ? inside.length === 1
      ? `${inside[0] === userId ? "Você está" : `${firstName(first)} está`} na sala`
      : "estão na sala agora"
    : "Ninguém na sala agora";

  return (
    <article className="flex w-full min-w-0 flex-col rounded-[20px] border border-black/[0.08] bg-card px-5 pb-4 pt-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:w-[360px]">
      <header className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-snug tracking-[-0.02em]">
          {channel.name}
        </h3>
        <button
          type="button"
          onClick={onShare}
          aria-label={
            canManage ? `Acesso e convite de ${channel.name}` : `Compartilhar ${channel.name}`
          }
          className="-mr-1.5 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#a3a3a3] outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
        >
          {canManage ? (
            <Setting4 size={16} color="currentColor" />
          ) : (
            <Link21 size={16} color="currentColor" />
          )}
        </button>
      </header>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip>
          {/* O cadeado cheio em laranja claro, o mesmo do "Com pedido" ao criar. */}
          {locked ? (
            <Lock1 size={15} color={LOCK_TONE} variant="Bold" className="shrink-0" />
          ) : (
            <Unlock size={15} color={LOCK_TONE} variant="Bold" className="shrink-0" />
          )}
          {locked ? "Com pedido" : "Aberta ao time"}
        </Chip>
        {creator && (
          <Chip>
            <UserAvatar profile={creator} size={16} showStatus={false} />
            {creator.id === userId ? "Sua sala" : firstName(creator)}
          </Chip>
        )}
        {canManage && lockable && pending.length > 0 && (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-brand-soft px-2.5 text-[12.5px] font-medium text-[#9a3a00] transition-colors hover:bg-[#ffe4d1]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {pending.length} {pending.length === 1 ? "pedido" : "pedidos"}
          </button>
        )}
      </div>

      <div className="mt-3 flex h-7 items-center gap-2.5">
        {faces.length > 0 && <AvatarStack ids={faces} profiles={profiles} max={3} size={26} />}
        <span
          className={cn(
            "min-w-0 truncate text-[13.5px]",
            live ? "text-[#404040]" : "text-[#8a8a8a]",
          )}
        >
          {attendance}
        </span>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-[#8a8a8a]">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#16a34a]" />}
        {live ? "Ao vivo" : "Call da sala"}
      </p>

      <button
        type="button"
        onClick={door.act}
        title={door.icon === "clock" ? "Toque para cancelar o pedido" : undefined}
        className="group mt-1.5 flex h-12 w-full max-w-[290px] items-center gap-2.5 rounded-full bg-[#1c1d22] pl-1.5 pr-4 text-left text-white outline-none transition-[background-color,transform] duration-200 ease-clyro hover:bg-[#26272e] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.99]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#1c1d22] transition-transform duration-200 ease-clyro group-hover:scale-105">
          {door.icon === "play" ? (
            <Play size={16} variant="Bold" color="currentColor" className="translate-x-px" />
          ) : door.icon === "clock" ? (
            <Clock size={16} color="currentColor" />
          ) : (
            <Lock1 size={15} variant="Bold" color="currentColor" />
          )}
        </span>
        <span
          aria-hidden
          className="flex h-5 min-w-0 flex-1 items-center gap-[3px] overflow-hidden"
        >
          {WAVE.map((h, i) => (
            <span
              key={i}
              className={cn(
                "w-[2px] shrink-0 rounded-full",
                live ? "clyro-eq bg-white/55" : "bg-white/25",
              )}
              style={{ height: Math.round(h * 0.75), ["--d" as string]: `${(i % 6) * 120}ms` }}
            />
          ))}
        </span>
        {live && since ? (
          <span className="shrink-0 text-[14px] font-medium tabular-nums">
            {elapsed(now - since)}
          </span>
        ) : null}
        <span className="shrink-0 text-[12.5px] font-medium text-white/70">{door.label}</span>
      </button>

      <div
        role="tablist"
        aria-label={`Sobre ${channel.name}`}
        className="mt-4 flex border-b border-black/[0.08]"
      >
        <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>
          <Message
            size={15}
            color={tab === "chat" ? "var(--brand)" : "currentColor"}
            variant={tab === "chat" ? "Bold" : "Linear"}
          />
          Conversa
        </TabButton>
        <TabButton active={tab === "about"} onClick={() => setTab("about")}>
          <InfoCircle
            size={15}
            color={tab === "about" ? "var(--brand)" : "currentColor"}
            variant={tab === "about" ? "Bold" : "Linear"}
          />
          Sobre
        </TabButton>
      </div>

      <div className="mt-3 text-[13.5px] leading-[1.55]">
        {tab === "chat" ? (
          !canEnter ? (
            <p className="text-[#8a8a8a]">A conversa aparece para quem tem acesso.</p>
          ) : messages.length === 0 ? (
            <p className="text-[#8a8a8a]">Ninguém escreveu aqui ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1 [mask-image:linear-gradient(to_bottom,black_50%,transparent)]">
              {[...messages]
                .slice(0, 3)
                .reverse()
                .map((m) => (
                  <li key={m.id} className="line-clamp-2 text-[#404040]">
                    <span className="font-medium text-foreground">
                      {m.author_id === userId ? "Você" : firstName(profiles?.get(m.author_id))}
                    </span>{" "}
                    {m.content.replace(/\*\*|~~|`|\*/g, "")}
                  </li>
                ))}
            </ul>
          )
        ) : (
          <div className="text-[#404040]">
            <p className={cn("line-clamp-3", !settings?.topic && "text-[#8a8a8a]")}>
              {settings?.topic || "Sem descrição ainda."}
            </p>
            <p className="mt-1.5 text-[12.5px] text-[#8a8a8a]">
              {creator ? `Criada por ${nameOf(creator)}` : "Sala do workspace"}
              {settings?.created_at &&
                ` em ${new Date(settings.created_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`}
              {locked &&
                ` · ${approved} ${approved === 1 ? "pessoa liberada" : "pessoas liberadas"}`}
            </p>
          </div>
        )}
      </div>

      {canEnter && (
        <button
          type="button"
          onClick={onEnter}
          className="mt-2 self-start rounded-md text-[13.5px] font-medium outline-none transition-colors hover:text-[#c2410c] focus-visible:ring-2 focus-visible:ring-brand"
        >
          {here ? "Voltar para a sala" : "Abrir sala"}
        </button>
      )}
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-black/[0.08] px-2.5 text-[12.5px] font-medium text-[#404040]">
      {children}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
        active
          ? "border-foreground font-medium text-foreground"
          : "border-transparent text-[#8a8a8a] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CreateRoomDialog({
  open,
  onOpenChange,
  lockable,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockable: boolean;
  onCreate: (input: { name: string; topic: string; locked: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate({ name, topic, locked: lockable && locked });
      setName("");
      setTopic("");
      setLocked(false);
    } catch {
      toast.error("Não foi possível criar a sala.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/40 backdrop-blur-[3px] duration-200 motion-reduce:animate-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          submitRef.current?.focus({ preventScroll: true });
        }}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[420px] gap-0 overflow-y-auto rounded-[24px] border-black/10 bg-card p-5 shadow-[0_24px_80px_-16px_rgb(0_0_0/0.28)] duration-300 ease-clyro data-[state=closed]:duration-150 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-3 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98 motion-reduce:animate-none sm:rounded-[24px] sm:p-6"
      >
        <DialogClose className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand">
          <CloseCircle size={20} color="currentColor" aria-hidden="true" />
          <span className="sr-only">Fechar</span>
        </DialogClose>
        <div className="clyro-in-pop mb-3 grid size-11 place-items-center rounded-[14px] bg-brand-soft text-brand">
          <Microphone2 size={24} color="currentColor" variant="Bold" aria-hidden="true" />
        </div>
        <DialogTitle className="text-[22px] font-semibold tracking-[-0.025em]">
          Nova sala
        </DialogTitle>
        <DialogDescription className="mt-1.5 leading-relaxed">
          A sala fica visível para todo o time.
        </DialogDescription>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="room-name">
              Nome <span className="ml-1 text-xs font-normal text-muted-foreground">opcional</span>
            </Label>
            <Input
              id="room-name"
              maxLength={48}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={DEFAULT_ROOM_NAME}
              className="h-10 rounded-[12px] bg-muted/35 shadow-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-topic">
              Descrição{" "}
              <span className="ml-1 text-xs font-normal text-muted-foreground">opcional</span>
            </Label>
            <Textarea
              id="room-topic"
              maxLength={280}
              rows={2}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Sobre o que é a sala?"
              className="min-h-14 resize-y rounded-[12px] bg-muted/35 shadow-none"
            />
          </div>

          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1.5 text-sm font-medium">Quem pode entrar</legend>
            <AccessOption
              selected={!locked || !lockable}
              onSelect={() => setLocked(false)}
              icon={<Unlock size={17} color="currentColor" variant="Bold" />}
              title="Aberta ao time"
              body="Entrada direta"
            />
            <AccessOption
              selected={lockable && locked}
              disabled={!lockable}
              onSelect={() => setLocked(true)}
              icon={<Lock1 size={17} color="currentColor" variant="Bold" />}
              title="Com pedido"
              body={lockable ? "Entrada com aprovação" : "Indisponível neste espaço"}
            />
          </fieldset>

          <button
            ref={submitRef}
            type="submit"
            disabled={busy}
            className="group mt-1 flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-[opacity,transform] duration-200 ease-clyro hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Criando…" : "Criar e entrar"}
            {!busy && (
              <ArrowRight
                size={17}
                color="currentColor"
                className="transition-transform motion-safe:group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            )}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessOption({
  selected,
  disabled = false,
  onSelect,
  icon,
  title,
  body,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <label
      className={cn(
        "relative flex min-w-0 cursor-pointer flex-col items-start gap-1 rounded-[14px] border px-3 py-2.5 transition-colors duration-200 ease-clyro has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
        selected ? "border-brand/50 bg-brand-soft/60" : "border-border",
        disabled ? "cursor-not-allowed opacity-55" : "hover:border-brand/60",
      )}
    >
      <input
        type="radio"
        name="room-access"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <span aria-hidden="true" className="text-brand">
        {icon}
      </span>
      {selected && (
        <TickCircle
          size={15}
          color="var(--brand)"
          variant="Bold"
          className="absolute right-2.5 top-2.5"
          aria-hidden="true"
        />
      )}
      <span className="text-[13px] font-medium">{title}</span>
      <span className="text-xs leading-snug text-muted-foreground">{body}</span>
    </label>
  );
}

/**
 * Compartilhar e decidir quem entra, no desenho da referência: a prévia da
 * sala num fundo areia, o link com Copiar e, embaixo, com quem a sala é
 * compartilhada — o time inteiro, direto ou com pedido.
 */
function RoomShareDialog({
  open,
  onOpenChange,
  workspace,
  channel,
  locked,
  topic,
  createdBy,
  canManage,
  lockable,
  inside,
  access,
  members,
  profiles,
  now,
  onToggleLocked,
  onDecide,
  onRevoke,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Server;
  channel: Channel;
  locked: boolean;
  topic: string | null;
  createdBy: string | null;
  canManage: boolean;
  lockable: boolean;
  inside: string[];
  access: RoomAccess[];
  members: WorkspaceMember[];
  profiles: Map<string, Profile> | undefined;
  now: number;
  onToggleLocked: (locked: boolean) => void;
  onDecide: (personId: string, approve: boolean) => void;
  onRevoke: (personId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const creator = createdBy ? profiles?.get(createdBy) : undefined;
  const pending = access.filter((a) => a.status === "pending");
  const approved = access.filter((a) => a.status === "approved");
  const link =
    typeof window !== "undefined" ? `${window.location.origin}/app?sala=${channel.id}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[480px] gap-0 overflow-y-auto rounded-[28px] p-0 clyro-scroll">
        {/* Prévia da sala no fundo areia, cortada embaixo como na referência. */}
        <div className="mx-4 mt-4 rounded-[20px] bg-[#f4f2ee] px-6 pt-6 sm:mx-5 sm:mt-5 sm:px-10 sm:pt-8">
          <div className="rounded-t-[18px] border border-b-0 border-black/[0.06] bg-card px-5 pb-5 pt-5">
            {creator ? (
              <span className="inline-flex rounded-full ring-2 ring-brand/30 ring-offset-2">
                <UserAvatar profile={creator} size={44} showStatus={false} />
              </span>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft">
                <Mascot pose="energia" size={34} />
              </span>
            )}
            <p className="mt-4 truncate text-[18px] font-medium tracking-[-0.02em]">
              {channel.name}
            </p>
            <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.55] text-[#737373]">
              {topic ||
                `Sala de ${workspace.name}. Quem entra fala por voz e conversa no chat da sala.`}
            </p>
            <div className="mt-4 flex h-8 items-center gap-2">
              {inside.length > 0 ? (
                <>
                  <AvatarStack ids={inside} profiles={profiles} max={4} size={28} />
                  <span className="text-[13px] text-[#737373]">na sala agora</span>
                </>
              ) : (
                <span className="text-[13px] text-[#8a8a8a]">Ninguém na sala agora</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5 sm:px-7">
          <DialogTitle className="text-[20px] font-medium tracking-[-0.02em]">
            Compartilhar sala
          </DialogTitle>
          <DialogDescription className="mt-1 text-[14px] leading-[1.5] text-[#737373]">
            Todo mundo do {workspace.name} vê a sala. Quem cuida dela decide se entram direto ou
            pedem antes.
          </DialogDescription>

          <div className="mt-4 flex h-14 items-center gap-3 rounded-[14px] border border-black/[0.08] bg-[#fafaf9] pl-4 pr-2">
            <Link21 size={19} color="currentColor" className="shrink-0 text-[#737373]" />
            <span className="min-w-0 flex-1 truncate text-[15px]">Link da sala</span>
            <button
              type="button"
              onClick={() => void copy()}
              className="h-10 shrink-0 rounded-[10px] border border-black/[0.1] bg-card px-4 text-[14px] font-medium outline-none transition-[background-color,transform] duration-200 ease-clyro hover:bg-[#f5f5f5] focus-visible:ring-2 focus-visible:ring-brand active:scale-95"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>

          <p className="mt-5 text-[13.5px] font-medium text-[#737373]">Compartilhar com</p>

          <div className="mt-2 flex items-center gap-3 py-2">
            <WorkspaceIcon workspace={workspace} size={28} />
            <span className="min-w-0 truncate text-[15px] font-medium">{workspace.name}</span>
            <span className="shrink-0 rounded-full border border-black/[0.1] px-2 py-0.5 text-[12.5px] text-[#525252]">
              Time
            </span>
            <span className="ml-auto hidden sm:block">
              <AvatarStack
                ids={members.map((m) => m.user_id)}
                profiles={profiles}
                max={5}
                size={26}
              />
            </span>
            <Switch
              checked={!locked}
              disabled={!canManage || !lockable}
              onCheckedChange={(open) => onToggleLocked(!open)}
              aria-label="Entrar sem pedir"
              className="ml-auto shrink-0 data-[state=checked]:bg-brand sm:ml-2"
            />
          </div>
          <p className="-mt-1 pl-10 text-[12.5px] leading-[1.45] text-[#8a8a8a]">
            {!lockable
              ? "Entrar com pedido precisa da migração de acesso."
              : locked
                ? "Desligado: quem não foi liberado pede para entrar."
                : "Ligado: qualquer pessoa do time entra direto."}
            {lockable && !canManage && " Só quem criou a sala ou um admin muda isso."}
          </p>

          {lockable && locked && (
            <div className="mt-3 flex items-center gap-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                <Lock1 size={15} color="var(--brand)" variant="Bold" />
              </span>
              <span className="text-[15px] font-medium">Liberados</span>
              <span className="rounded-full border border-black/[0.1] px-2 py-0.5 text-[12.5px] text-[#525252]">
                {approved.length + (createdBy ? 1 : 0)}
              </span>
              {approved.length > 0 && (
                <span className="ml-auto">
                  <AvatarStack
                    ids={approved.map((a) => a.user_id)}
                    profiles={profiles}
                    max={5}
                    size={26}
                  />
                </span>
              )}
            </div>
          )}

          {canManage && pending.length > 0 && (
            <section className="mt-4">
              <h3 className="text-[13.5px] font-medium text-[#737373]">
                Pedindo para entrar · {pending.length}
              </h3>
              <ul className="mt-2 flex flex-col gap-1">
                {pending.map((a) => {
                  const person = profiles?.get(a.user_id);
                  return (
                    <li key={a.user_id} className="flex items-center gap-3 rounded-[14px] py-1.5">
                      <UserAvatar profile={person} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">
                          {nameOf(person)}
                        </span>
                        <span className="block text-[12.5px] text-[#8a8a8a]">
                          pediu {ago(a.updated_at, now)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onDecide(a.user_id, false)}
                        className="h-8 rounded-full px-3 text-[13px] font-medium text-[#525252] transition-colors hover:bg-secondary"
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecide(a.user_id, true)}
                        className="h-8 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background transition-[opacity,transform] hover:opacity-90 active:scale-95"
                      >
                        Liberar
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {canManage && locked && approved.length > 0 && (
            <section className="mt-4">
              <h3 className="text-[13.5px] font-medium text-[#737373]">Com acesso</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {approved.map((a) => {
                  const person = profiles?.get(a.user_id);
                  return (
                    <li key={a.user_id} className="group flex items-center gap-3 py-1.5">
                      <UserAvatar profile={person} size={30} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{nameOf(person)}</span>
                      <button
                        type="button"
                        onClick={() => onRevoke(a.user_id)}
                        className="h-8 rounded-full px-3 text-[13px] font-medium text-[#8a8a8a] transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
