import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Add,
  Calendar2,
  EyeSlash,
  InfoCircle,
  Message,
  Profile2User,
  TaskSquare,
  TickCircle,
  Trash,
  UserAdd,
  VolumeHigh,
  type Icon,
} from "iconsax-react";
import { Check, MoreHorizontal } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Channel, Profile, Server } from "@/lib/clyro-types";
import { ROLE_LABEL, type Team, type WorkspaceMember } from "@/lib/workspace-queries";
import type { AccessRequest } from "@/lib/project-queries";
import {
  useMeetingActions,
  useTaskActions,
  type Meeting,
  type Task,
  type TaskStatus,
} from "@/lib/activity-queries";
import type { BoardData, FeedEvent, FeedKind, FeedSource } from "@/lib/activity-feed";
import { UserAvatar } from "@/components/clyro/primitives";
import { Mascot } from "./mascot";
import { AvatarStack, activityLine } from "./team-panel";

type Tone = "rose" | "sky" | "mint" | "amber" | "peach" | "gray";

const TONE: Record<Tone, string> = {
  rose: "bg-[#fdecef] text-[#a3354f]",
  sky: "bg-[#e8f2fd] text-[#2a5f96]",
  mint: "bg-[#e5f6ec] text-[#2b7049]",
  amber: "bg-[#fff1df] text-[#8f5200]",
  peach: "bg-brand-soft text-brand-ink",
  gray: "bg-[#f2f2f2] text-muted-foreground",
};

/** O selo no canto do avatar: a cor diz o tipo, o ícone o que aconteceu. */
const BADGE: Record<FeedKind, string> = {
  call: "bg-brand",
  message: "bg-[#3d7fd6]",
  task: "bg-[#2f9a5f]",
  people: "bg-[#e0901c]",
};

/* O que você ocultou e quando abriu o painel pela última vez, por workspace. */
function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

type FeedProps = {
  workspace: Server;
  events: FeedEvent[];
  data: BoardData;
  filter: FeedKind | "all";
  members: WorkspaceMember[];
  teams: Team[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  onJoinVoice: (channel: Channel) => void;
  onOpenChannel: (channelId: string) => void;
  onOpenProfile: (id: string) => void;
  onOpenRequests: () => void;
};

const PAGE = 10;

export function ActivityFeed(props: FeedProps) {
  const { workspace, events, data, filter, profiles } = props;
  const [limit, setLimit] = useState(PAGE);
  const [hidden, setHidden] = useState<string[]>([]);
  const [seenAt, setSeenAt] = useState<number | null>(null);

  // Lê o que estava guardado e marca esta visita: o que chegar depois ganha o ponto.
  useEffect(() => {
    setHidden(readStore<string[]>(`clyro:feed-hidden:${workspace.id}`, []));
    setSeenAt(readStore<number | null>(`clyro:feed-seen:${workspace.id}`, null));
    writeStore(`clyro:feed-seen:${workspace.id}`, Date.now());
    setLimit(PAGE);
  }, [workspace.id]);

  useEffect(() => setLimit(PAGE), [filter]);

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [key, ...prev].slice(0, 200);
      writeStore(`clyro:feed-hidden:${workspace.id}`, next);
      return next;
    });
  };

  const list = filter === "all" ? events : events.filter((e) => e.kind === filter);
  const shown = list.slice(0, limit);
  const nameOf = (id: string | null | undefined) => {
    if (!id) return "Alguém";
    const p = profiles?.get(id);
    return p?.display_name || p?.username || "Alguém";
  };
  const live = filter === "all" || filter === "call" ? data.live : [];

  return (
    <div className="flex flex-col gap-4">
      {live.map(({ channel, userIds }) => (
        <article
          key={channel.id}
          className="rounded-[20px] border border-[#ffd9c2] bg-[linear-gradient(180deg,#fff7f1,#ffffff_70%)] p-4"
        >
          <div className="flex flex-wrap items-center gap-4">
            <AvatarStack ids={userIds} profiles={profiles} max={4} size={34} />
            <p className="min-w-[12rem] flex-1 text-[14px] leading-[1.5] text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">
              {userIds.length === 1 ? (
                <>
                  <b>{nameOf(userIds[0])}</b> está em call em <b>{channel.name}</b>
                </>
              ) : (
                <>
                  <b>{userIds.slice(0, 2).map(nameOf).join(" e ")}</b>
                  {userIds.length > 2 && <> e mais {userIds.length - 2}</>} estão em call em{" "}
                  <b>{channel.name}</b>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => props.onJoinVoice(channel)}
              className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-[13.5px] font-medium text-white transition-[background-color,transform] duration-200 ease-clyro hover:bg-brand-strong active:scale-[0.98]"
            >
              Entrar na call
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag tone="peach">
              <span className="relative mr-1.5 flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
                <span className="relative h-2 w-2 rounded-full bg-brand" />
              </span>
              Ao vivo
            </Tag>
            <Tag tone="mint">{channel.name}</Tag>
          </div>
        </article>
      ))}

      {list.length === 0 && live.length === 0 ? (
        <div className="flex flex-col items-center rounded-[20px] border border-black/[0.07] px-6 py-10 text-center">
          <Mascot pose="neutro" size={64} float />
          <p className="mt-3 text-[14px] font-medium">
            {filter === "all" ? "Nada aconteceu por aqui ainda" : "Nada deste tipo por enquanto"}
          </p>
          <p className="mt-1 max-w-[40ch] text-[13px] leading-[1.5] text-muted-foreground">
            O que o time fizer aparece aqui: quem entrou, calls, mensagens nos canais e tasks.
          </p>
        </div>
      ) : (
        shown.map((e) =>
          hidden.includes(e.key) ? (
            <HiddenStrip key={e.key} onUndo={() => toggleHidden(e.key)} />
          ) : (
            <FeedCard
              key={e.key}
              event={e}
              fresh={seenAt !== null && e.at > seenAt}
              onHide={() => toggleHidden(e.key)}
              nameOf={nameOf}
              {...props}
            />
          ),
        )
      )}

      {list.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="mx-auto mt-1 inline-flex h-9 items-center rounded-full border border-black/[0.09] px-5 text-[13.5px] font-medium transition-[border-color,transform] duration-200 ease-clyro hover:border-black/20 active:scale-[0.98]"
        >
          Ver mais atividade
        </button>
      )}
    </div>
  );
}

function Tag({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-[14rem] items-center rounded-full px-2.5 text-[12.5px] leading-none",
        TONE[tone],
      )}
    >
      <span className="flex min-w-0 items-center truncate">{children}</span>
    </span>
  );
}

function HiddenStrip({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-[18px] bg-[#f2f2f2] px-4 text-[13.5px] text-muted-foreground clyro-fade-in">
      <EyeSlash size={17} color="currentColor" className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">Você ocultou esta atividade</span>
      <button
        type="button"
        onClick={onUndo}
        className="h-8 shrink-0 rounded-full px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-black/[0.05]"
      >
        Desfazer
      </button>
    </div>
  );
}

const ICON: Record<FeedSource["type"], Icon> = {
  join: Profile2User,
  voice: VolumeHigh,
  message: Message,
  assigned: TaskSquare,
  done: TickCircle,
  meeting: Calendar2,
  team: Profile2User,
  invite: UserAdd,
  request: Add,
};

function FeedCard({
  event,
  fresh,
  onHide,
  nameOf,
  workspace,
  data,
  members,
  teams,
  profiles,
  userId,
  onJoinVoice,
  onOpenChannel,
  onOpenProfile,
  onOpenRequests,
}: FeedProps & {
  event: FeedEvent;
  fresh: boolean;
  onHide: () => void;
  nameOf: (id: string | null | undefined) => string;
}) {
  const [open, setOpen] = useState(false);
  const taskActions = useTaskActions(workspace.id);
  const s = event.source;
  const BadgeIcon = ICON[s.type];
  const channel = (id: string) => data.channels.find((c) => c.id === id);
  // "Você" no começo da frase, "você" no meio dela.
  const you = (id: string | null | undefined, start = false) =>
    id === userId ? (start ? "Você" : "você") : nameOf(id);
  const b = (id: string | null | undefined) => <b>{you(id)}</b>;
  const B = (id: string | null | undefined) => <b>{you(id, true)}</b>;

  // A frase: nomes e coisas escuros, os conectores em cinza.
  let sentence: React.ReactNode;
  const tags: { label: React.ReactNode; tone: Tone }[] = [];
  let detail: React.ReactNode = null;
  let action: { label: string; onClick: () => void } | null = null;

  switch (s.type) {
    case "join": {
      sentence = (
        <>
          {B(s.member.user_id)} entrou no workspace <b>{workspace.name}</b>
        </>
      );
      tags.push({ label: ROLE_LABEL[s.member.role], tone: "amber" });
      teams
        .filter((t) => t.member_ids.includes(s.member.user_id))
        .forEach((t) => tags.push({ label: t.name, tone: "sky" }));
      break;
    }
    case "voice": {
      const room = channel(s.channelId);
      sentence = (
        <>
          {B(event.actor)} entrou na call em <b>{room?.name ?? "uma sala"}</b>
        </>
      );
      tags.push({ label: room?.name ?? "Sala", tone: "mint" }, { label: "Call", tone: "peach" });
      const inRoom = data.live.find((l) => l.channel.id === s.channelId)?.userIds ?? [];
      if (inRoom.length) {
        detail = (
          <div className="flex flex-col items-center gap-2">
            <AvatarStack ids={inRoom} profiles={profiles} max={6} size={32} />
            <span className="text-[13px] text-muted-foreground">
              {inRoom.length === 1
                ? "1 pessoa na sala agora"
                : `${inRoom.length} pessoas na sala agora`}
            </span>
          </div>
        );
        if (room) action = { label: "Entrar na call", onClick: () => onJoinVoice(room) };
      }
      break;
    }
    case "message": {
      const ch = channel(s.channelId);
      sentence = (
        <>
          {B(event.actor)} mandou mensagem em <b>#{ch?.name ?? "canal"}</b>
        </>
      );
      tags.push(
        { label: `#${ch?.name ?? "canal"}`, tone: "sky" },
        { label: "Mensagem", tone: "rose" },
      );
      detail = (
        <blockquote className="w-full max-w-[52ch] whitespace-pre-wrap break-words rounded-[14px] bg-card px-3.5 py-2.5 text-left text-[13.5px] leading-[1.5] text-foreground">
          {s.content}
        </blockquote>
      );
      action = {
        label: `Abrir #${ch?.name ?? "canal"}`,
        onClick: () => onOpenChannel(s.channelId),
      };
      break;
    }
    case "assigned": {
      const t = s.task;
      sentence = (
        <>
          {B(t.created_by)} passou a task <b>“{t.title}”</b> para {b(t.assignee_id)}
        </>
      );
      tags.push({ label: "Task", tone: "mint" }, { label: STATUS_LABEL[t.status], tone: "gray" });
      if (t.assignee_id === userId && t.status !== "done") {
        action = {
          label: "Concluir task",
          onClick: () => taskActions.setStatus.mutate({ id: t.id, status: "done" }),
        };
      }
      break;
    }
    case "done": {
      sentence = (
        <>
          {B(event.actor)} concluiu a task <b>“{s.task.title}”</b>
        </>
      );
      tags.push({ label: "Task", tone: "mint" }, { label: "Concluída", tone: "gray" });
      break;
    }
    case "meeting": {
      const m = s.meeting;
      const room = data.voiceChannels.find((c) => c.id === m.channel_id);
      const start = new Date(m.starts_at).getTime();
      const ongoing = start <= Date.now() && Date.now() < start + m.duration_min * 60_000;
      sentence = (
        <>
          {B(m.created_by)} agendou <b>{m.title}</b> para{" "}
          <b>
            {dayLabel(m.starts_at).toLowerCase()} às {timeOf(m.starts_at)}
          </b>
        </>
      );
      tags.push(
        { label: "Reunião", tone: "peach" },
        { label: `${m.duration_min} min`, tone: "gray" },
      );
      if (room) tags.push({ label: room.name, tone: "mint" });
      if (ongoing && room)
        action = { label: "Entrar na reunião", onClick: () => onJoinVoice(room) };
      break;
    }
    case "team": {
      const t = s.team;
      sentence = (
        <>
          {B(t.created_by)} criou a equipe <b>{t.name}</b>
        </>
      );
      tags.push(
        { label: "Equipe", tone: "amber" },
        {
          label: t.member_ids.length === 1 ? "1 pessoa" : `${t.member_ids.length} pessoas`,
          tone: "gray",
        },
      );
      if (t.member_ids.length) {
        detail = <AvatarStack ids={t.member_ids} profiles={profiles} max={8} size={32} />;
      }
      break;
    }
    case "invite": {
      const i = s.invite;
      sentence = (
        <>
          {B(i.invited_by)} convidou {i.user_id ? b(i.user_id) : <b>{i.email ?? "alguém"}</b>} para
          o workspace
        </>
      );
      tags.push(
        { label: "Convite", tone: "rose" },
        { label: i.role === "admin" ? "Admin" : "Membro", tone: "amber" },
      );
      break;
    }
    case "request": {
      sentence = (
        <>
          {B(s.request.user_id)} pediu para entrar em <b>{workspace.name}</b>
        </>
      );
      tags.push({ label: "Pedido de acesso", tone: "peach" });
      if (s.request.message) {
        detail = (
          <blockquote className="w-full max-w-[52ch] rounded-[14px] bg-card px-3.5 py-2.5 text-left text-[13.5px] leading-[1.5]">
            {s.request.message}
          </blockquote>
        );
      }
      action = { label: "Ver pedido", onClick: onOpenRequests };
      break;
    }
  }

  const MAX_TAGS = 3;
  const extra = tags.length - MAX_TAGS;
  const actor = profiles?.get(event.actor ?? "");
  const member = members.find((m) => m.user_id === event.actor);
  const regionId = `feed-${event.key}`;

  return (
    <article className="rounded-[20px] border border-black/[0.07] bg-card p-4 shadow-[0_1px_0_rgb(0_0_0/0.03)]">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => event.actor && onOpenProfile(event.actor)}
          aria-label={`Ver perfil de ${nameOf(event.actor)}`}
          className="relative shrink-0 rounded-full outline-none transition-transform duration-200 ease-clyro hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-brand"
        >
          <UserAvatar profile={actor} size={40} showStatus={false} />
          <span
            className={cn(
              "absolute -bottom-1 -right-1 flex h-[19px] w-[19px] items-center justify-center rounded-full text-white ring-2 ring-card",
              BADGE[event.kind],
            )}
          >
            <BadgeIcon size={11} color="currentColor" variant="Bold" />
          </span>
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-pretty text-[14px] leading-[1.5] text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">
            {sentence}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{ago(event.at)}</p>
        </div>
        <div className="-mr-2 -mt-1 flex shrink-0 items-center">
          <button
            type="button"
            onClick={onHide}
            aria-label="Ocultar esta atividade"
            title="Ocultar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#a3a3a3] transition-[background-color,color,transform] duration-200 ease-clyro hover:bg-secondary hover:text-foreground active:scale-90"
          >
            <EyeSlash size={17} color="currentColor" />
          </button>
          {fresh && (
            <span
              className="ml-1 mr-1 h-2.5 w-2.5 rounded-full bg-brand"
              aria-label="Novo"
              role="img"
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.slice(0, MAX_TAGS).map((t, i) => (
          <Tag key={i} tone={t.tone}>
            {t.label}
          </Tag>
        ))}
        {extra > 0 && (
          <span className="inline-flex h-6 items-center rounded-full border border-black/[0.08] px-2.5 text-[12.5px] text-muted-foreground">
            +{extra}
          </span>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-[14px] bg-[#f5f5f5]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={regionId}
          className="flex h-10 w-full items-center gap-2.5 px-3.5 text-left text-[13.5px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <InfoCircle
            size={16}
            color="currentColor"
            variant="Bold"
            className="shrink-0 opacity-60"
          />
          Resumo
          <span
            aria-hidden="true"
            className={cn(
              "ml-auto text-[13px] transition-transform duration-300 ease-clyro",
              open && "rotate-180",
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>
        <div
          id={regionId}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-clyro motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden" inert={!open}>
            <div className="flex flex-col items-center px-4 pb-5 pt-2 text-center">
              <UserAvatar profile={actor} size={72} showStatus={false} />
              <p className="mt-2.5 text-[15px] font-medium tracking-[-0.01em]">
                {nameOf(event.actor)}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {member
                  ? `${ROLE_LABEL[member.role]} em ${workspace.name}`
                  : "Ainda fora do workspace"}
              </p>
              {actor && (
                <p className="mt-1 line-clamp-2 max-w-[44ch] text-[13px] leading-[1.5] text-muted-foreground">
                  {actor.bio || activityLine(actor)}
                </p>
              )}
              {detail && <div className="mt-4 flex w-full justify-center">{detail}</div>}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {action && (
                  <button
                    type="button"
                    onClick={action.onClick}
                    className="inline-flex h-8 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-[opacity,transform] duration-200 ease-clyro hover:opacity-90 active:scale-[0.98]"
                  >
                    {action.label}
                  </button>
                )}
                {event.actor && (
                  <button
                    type="button"
                    onClick={() => onOpenProfile(event.actor as string)}
                    className="inline-flex h-8 items-center rounded-full border border-black/[0.1] bg-card px-4 text-[13px] font-medium transition-[border-color,transform] duration-200 ease-clyro hover:border-black/25 active:scale-[0.98]"
                  >
                    Ver perfil
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "A fazer",
  doing: "Fazendo",
  done: "Feita",
};

/* ------------------------------------------------------------------ */
/* Coluna lateral: para você, tasks, agenda.                            */
/* ------------------------------------------------------------------ */

export function BoardAside({
  workspace,
  data,
  members,
  requests,
  profiles,
  userId,
  canManage,
  onJoinVoice,
  onOpenTasks,
  onOpenRequests,
}: {
  workspace: Server;
  data: BoardData;
  members: WorkspaceMember[];
  requests: AccessRequest[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  canManage: boolean;
  onJoinVoice: (channel: Channel) => void;
  onOpenTasks: () => void;
  onOpenRequests: () => void;
}) {
  const nameOf = (id: string | null | undefined) => {
    if (!id) return "Alguém";
    const p = profiles?.get(id);
    return p?.display_name || p?.username || "Alguém";
  };
  return (
    <>
      <ForYouCard
        data={data}
        userId={userId}
        requests={requests}
        canManage={canManage}
        profiles={profiles}
        onRequests={onOpenRequests}
        onJoinVoice={onJoinVoice}
        onOpenTasks={onOpenTasks}
      />
      {data.missing ? (
        <SetupNotice />
      ) : (
        <>
          <MyTasks
            serverId={workspace.id}
            userId={userId}
            tasks={data.tasks}
            nameOf={nameOf}
            onOpenTasks={onOpenTasks}
          />
          <Agenda
            serverId={workspace.id}
            userId={userId}
            meetings={data.meetings}
            voiceChannels={data.voiceChannels}
            live={data.live}
            profiles={profiles}
            onJoin={onJoinVoice}
          />
          <Delegated
            serverId={workspace.id}
            userId={userId}
            tasks={data.tasks}
            members={members}
            profiles={profiles}
            nameOf={nameOf}
          />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Peças.                                                               */
/* ------------------------------------------------------------------ */

function Card({
  title,
  count,
  action,
  children,
  className,
}: {
  title: string;
  count?: number | undefined;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[18px] border border-black/[0.07] bg-card p-4", className)}>
      <header className="mb-3 flex min-h-8 items-center gap-2">
        <h3 className="text-[14px] font-medium tracking-[-0.01em]">{title}</h3>
        {!!count && <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>}
        <div className="ml-auto">{action}</div>
      </header>
      {children}
    </section>
  );
}

const ghostAction =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

function SetupNotice() {
  return (
    <section className="flex items-start gap-3 rounded-[18px] bg-[#f5f5f5] p-4">
      <Mascot pose="chuva" size={36} className="shrink-0" />
      <div>
        <p className="text-[13.5px] font-medium">Tasks e agenda ainda não foram ativadas</p>
        <p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
          Falta aplicar a migração <span className="font-mono text-[12px]">tasks_meetings</span> no
          banco do projeto. Assim que ela rodar, as tasks e reuniões aparecem aqui e no feed.
        </p>
      </div>
    </section>
  );
}

function TaskCheck({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const done = task.status === "done";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={done ? "Reabrir task" : "Concluir task"}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color] duration-200 ease-clyro",
        done
          ? "border-brand bg-brand text-white"
          : "border-black/25 hover:border-brand hover:bg-brand-soft",
      )}
    >
      {done && <Check size={12} />}
    </button>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "done" && "bg-[oklch(0.95_0.05_155)] text-[oklch(0.45_0.13_155)]",
        status === "doing" && "bg-brand-soft text-brand-strong",
        status === "todo" && "bg-secondary text-muted-foreground",
      )}
    >
      {status === "done" ? "Feita" : status === "doing" ? "Fazendo" : "A fazer"}
    </span>
  );
}

function TaskMenu({
  task,
  onStatus,
  onDelete,
  canDelete,
}: {
  task: Task;
  onStatus: (s: TaskStatus) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Opções da task"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-[opacity,background-color] hover:bg-secondary group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {task.status !== "doing" && (
          <DropdownMenuItem onClick={() => onStatus("doing")}>Marcar como fazendo</DropdownMenuItem>
        )}
        {task.status !== "todo" && (
          <DropdownMenuItem onClick={() => onStatus("todo")}>Voltar para a fazer</DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash size={14} color="currentColor" /> Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Concluída há menos de um dia ainda aparece riscada; depois sai da lista. */
function visible(task: Task) {
  if (task.status !== "done") return true;
  const at = task.completed_at ? new Date(task.completed_at).getTime() : 0;
  return Date.now() - at < 24 * 60 * 60 * 1000;
}

function MyTasks({
  serverId,
  userId,
  tasks,
  nameOf,
  onOpenTasks,
}: {
  serverId: string;
  userId: string;
  tasks: Task[];
  nameOf: (id: string) => string;
  onOpenTasks: () => void;
}) {
  const actions = useTaskActions(serverId);
  const [draft, setDraft] = useState("");
  const mine = tasks
    .filter((t) => (t.assignee_id ?? t.created_by) === userId && visible(t))
    .sort((a, b) => order(a) - order(b));
  const open = mine.filter((t) => t.status !== "done").length;

  const add = () => {
    if (!draft.trim()) return;
    actions.create.mutate(
      { title: draft, createdBy: userId, assigneeId: userId },
      {
        onSuccess: () => setDraft(""),
        onError: () => toast.error("Não foi possível criar a task."),
      },
    );
  };

  return (
    <Card
      title="Para fazer"
      count={open}
      action={
        <button type="button" onClick={onOpenTasks} className={ghostAction}>
          Ver todas
        </button>
      }
    >
      {mine.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">
          Nada na sua lista. Anote abaixo o que você vai puxar hoje.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {mine.slice(0, 6).map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-secondary/60"
            >
              <TaskCheck
                task={t}
                onToggle={() =>
                  actions.setStatus.mutate({
                    id: t.id,
                    status: t.status === "done" ? "todo" : "done",
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[14px]",
                    t.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {t.title}
                </span>
                {t.created_by !== userId && (
                  <span className="block truncate text-[12px] text-muted-foreground">
                    de {nameOf(t.created_by)}
                  </span>
                )}
              </span>
              {t.status === "doing" && <StatusPill status="doing" />}
              <TaskMenu
                task={t}
                canDelete={t.created_by === userId}
                onStatus={(status) => actions.setStatus.mutate({ id: t.id, status })}
                onDelete={() => actions.remove.mutate(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex h-10 items-center gap-2 rounded-[12px] bg-secondary px-3 focus-within:bg-card focus-within:shadow-[0_0_0_1.5px_var(--brand),0_0_0_5px_var(--brand-soft)]"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Add size={18} color="currentColor" className="shrink-0 text-muted-foreground" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          placeholder="Adicionar task"
          aria-label="Adicionar task"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
        />
      </form>
    </Card>
  );
}

function Delegated({
  serverId,
  userId,
  tasks,
  members,
  profiles,
  nameOf,
}: {
  serverId: string;
  userId: string;
  tasks: Task[];
  members: WorkspaceMember[];
  profiles: Map<string, Profile> | undefined;
  nameOf: (id: string) => string;
}) {
  const actions = useTaskActions(serverId);
  const others = members.filter((m) => m.user_id !== userId);
  const [draft, setDraft] = useState("");
  const [assignee, setAssignee] = useState("");
  const delegated = tasks
    .filter((t) => t.created_by === userId && t.assignee_id && t.assignee_id !== userId)
    .filter(visible)
    .sort((a, b) => order(a) - order(b));
  const target = assignee || others[0]?.user_id || "";

  const add = () => {
    if (!draft.trim() || !target) return;
    actions.create.mutate(
      { title: draft, createdBy: userId, assigneeId: target },
      {
        onSuccess: () => {
          setDraft("");
          toast.success(`Task enviada para ${nameOf(target)}.`);
        },
        onError: () => toast.error("Não foi possível delegar a task."),
      },
    );
  };

  return (
    <Card title="Delegadas" count={delegated.filter((t) => t.status !== "done").length}>
      {delegated.length === 0 ? (
        <p className="py-2 text-[13px] text-muted-foreground">
          {others.length
            ? "Passe uma task para alguém do time e acompanhe por aqui."
            : "Quando o time crescer, você delega tasks por aqui."}
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {delegated.slice(0, 6).map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-secondary/60"
            >
              <UserAvatar
                profile={profiles?.get(t.assignee_id ?? "")}
                size={28}
                showStatus={false}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[14px]",
                    t.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {t.title}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  para {nameOf(t.assignee_id ?? "")} · {ago(t.created_at)}
                </span>
              </span>
              <StatusPill status={t.status} />
              <TaskMenu
                task={t}
                canDelete
                onStatus={(status) => actions.setStatus.mutate({ id: t.id, status })}
                onDelete={() => actions.remove.mutate(t.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            placeholder="O que precisa ser feito?"
            aria-label="Nova task para delegar"
            className="h-10 min-w-0 flex-1 basis-40 rounded-[12px] bg-secondary px-3 text-[14px] outline-none placeholder:text-muted-foreground focus:bg-card focus:shadow-[0_0_0_1.5px_var(--brand),0_0_0_5px_var(--brand-soft)]"
          />
          <select
            value={target}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Para quem"
            className="h-10 max-w-[9.5rem] rounded-[12px] bg-secondary px-2.5 text-[13px] outline-none focus:shadow-[0_0_0_1.5px_var(--brand)]"
          >
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {nameOf(m.user_id)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!draft.trim() || actions.create.isPending}
            className="h-10 rounded-[12px] bg-foreground px-4 text-[13px] font-medium text-background transition-opacity disabled:opacity-40"
          >
            Delegar
          </button>
        </form>
      )}
    </Card>
  );
}

function Agenda({
  serverId,
  userId,
  meetings,
  voiceChannels,
  live,
  profiles,
  onJoin,
}: {
  serverId: string;
  userId: string;
  meetings: Meeting[];
  voiceChannels: Channel[];
  live: { channel: Channel; userIds: string[] }[];
  profiles: Map<string, Profile> | undefined;
  onJoin: (channel: Channel) => void;
}) {
  const actions = useMeetingActions(serverId);
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [form, setForm] = useState({
    title: "",
    date: isoDate(today),
    time: nextHalfHour(),
    duration: 30,
    channelId: "",
  });
  const roomId = form.channelId || voiceChannels[0]?.id || "";

  // Agrupa por dia: "Hoje", "Amanhã" ou a data.
  const groups = useMemo(() => {
    const out = new Map<string, Meeting[]>();
    meetings.forEach((m) => {
      const key = dayLabel(m.starts_at);
      out.set(key, [...(out.get(key) ?? []), m]);
    });
    return [...out.entries()];
  }, [meetings]);

  const submit = () => {
    if (!form.title.trim()) return;
    const startsAt = new Date(`${form.date}T${form.time}`);
    if (Number.isNaN(startsAt.getTime())) return;
    actions.create.mutate(
      {
        title: form.title,
        startsAt: startsAt.toISOString(),
        durationMin: form.duration,
        channelId: roomId || null,
        createdBy: userId,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm((f) => ({ ...f, title: "" }));
          toast.success("Reunião agendada.");
        },
        onError: () => toast.error("Não foi possível agendar."),
      },
    );
  };

  const field =
    "h-10 rounded-[12px] bg-secondary px-3 text-[14px] outline-none focus:bg-card focus:shadow-[0_0_0_1.5px_var(--brand),0_0_0_5px_var(--brand-soft)]";

  return (
    <Card
      title="Agenda"
      count={meetings.length}
      action={
        <button type="button" onClick={() => setOpen((o) => !o)} className={ghostAction}>
          {open ? (
            "Cancelar"
          ) : (
            <>
              <Calendar2 size={15} color="currentColor" /> Agendar
            </>
          )}
        </button>
      }
    >
      {open && (
        <form
          className="mb-4 grid grid-cols-2 gap-2 rounded-[16px] border border-black/[0.07] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={120}
            placeholder="Nome da reunião"
            aria-label="Nome da reunião"
            className={cn(field, "col-span-2")}
          />
          <input
            type="date"
            value={form.date}
            min={isoDate(today)}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            aria-label="Data"
            className={field}
          />
          <input
            type="time"
            value={form.time}
            onChange={(e) => setForm({ ...form, time: e.target.value })}
            aria-label="Horário"
            className={field}
          />
          <select
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
            aria-label="Duração"
            className={field}
          >
            {[15, 30, 45, 60, 90].map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
          <select
            value={roomId}
            onChange={(e) => setForm({ ...form, channelId: e.target.value })}
            aria-label="Sala"
            className={field}
          >
            {voiceChannels.length === 0 && <option value="">Sem sala</option>}
            {voiceChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!form.title.trim() || actions.create.isPending}
            className="col-span-2 h-10 rounded-[12px] bg-foreground text-[14px] font-medium text-background transition-opacity disabled:opacity-40"
          >
            Agendar reunião
          </button>
        </form>
      )}

      {meetings.length === 0 ? (
        !open && (
          <p className="py-2 text-[13px] text-muted-foreground">
            Nenhuma reunião marcada. Agende a daily ou a próxima conversa do time.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([day, list]) => (
            <div key={day}>
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">{day}</p>
              <ul className="flex flex-col gap-1.5">
                {list.map((m) => {
                  const start = new Date(m.starts_at).getTime();
                  const now = Date.now();
                  const ongoing = start <= now && now < start + m.duration_min * 60_000;
                  const room = voiceChannels.find((c) => c.id === m.channel_id);
                  const inRoom = live.find((l) => l.channel.id === m.channel_id)?.userIds ?? [];
                  return (
                    <li
                      key={m.id}
                      className={cn(
                        "group flex items-center gap-3 rounded-[14px] px-3 py-2.5",
                        ongoing ? "bg-brand-soft" : "bg-secondary/70",
                      )}
                    >
                      <span className="w-11 shrink-0 text-[14px] font-semibold tabular-nums">
                        {timeOf(m.starts_at)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{m.title}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">
                          {m.duration_min} min{room ? ` · ${room.name}` : ""}
                          {inRoom.length > 0 ? ` · ${inRoom.length} na sala` : ""}
                        </span>
                      </span>
                      {ongoing && room ? (
                        <button
                          type="button"
                          onClick={() => onJoin(room)}
                          className="h-8 rounded-full bg-brand px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
                        >
                          Entrar
                        </button>
                      ) : (
                        <UserAvatar
                          profile={profiles?.get(m.created_by)}
                          size={24}
                          showStatus={false}
                        />
                      )}
                      {m.created_by === userId && (
                        <button
                          type="button"
                          aria-label="Cancelar reunião"
                          onClick={() => actions.remove.mutate(m.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash size={14} color="currentColor" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* "Para você": o que pede a sua atenção, na coluna lateral.            */
/* ------------------------------------------------------------------ */

function ForYouCard({
  data,
  userId,
  requests,
  canManage,
  profiles,
  onRequests,
  onJoinVoice,
  onOpenTasks,
}: {
  data: BoardData;
  userId: string;
  requests: AccessRequest[];
  canManage: boolean;
  profiles: Map<string, Profile> | undefined;
  onRequests: () => void;
  onJoinVoice: (channel: Channel) => void;
  onOpenTasks: () => void;
}) {
  const nameOf = (id: string) =>
    profiles?.get(id)?.display_name || profiles?.get(id)?.username || "Alguém";
  const items: { key: string; title: string; body: string; onClick: () => void; tone?: "brand" }[] =
    [];

  data.live.forEach(({ channel, userIds }) => {
    if (userIds.includes(userId)) return;
    items.push({
      key: `live-${channel.id}`,
      title: `${userIds.length} em call agora`,
      body: `${userIds.map(nameOf).join(", ")} em ${channel.name}`,
      onClick: () => onJoinVoice(channel),
      tone: "brand",
    });
  });
  data.meetings.forEach((m) => {
    const mins = Math.round((new Date(m.starts_at).getTime() - Date.now()) / 60_000);
    if (mins < 0 || mins > 60) return;
    const room = data.voiceChannels.find((c) => c.id === m.channel_id);
    items.push({
      key: `soon-${m.id}`,
      title: mins <= 1 ? `${m.title} vai começar` : `${m.title} em ${mins} min`,
      body: room ? `Na sala ${room.name}` : "Reunião agendada",
      onClick: () => (room ? onJoinVoice(room) : undefined),
    });
  });
  if (canManage && requests.length > 0) {
    items.push({
      key: "requests",
      title: `${requests.length} ${requests.length === 1 ? "pedido de acesso" : "pedidos de acesso"}`,
      body: "Esperando a sua resposta",
      onClick: onRequests,
    });
  }
  data.tasks
    .filter(
      (t) =>
        t.assignee_id === userId &&
        t.created_by !== userId &&
        t.status !== "done" &&
        Date.now() - new Date(t.created_at).getTime() < 7 * 24 * 60 * 60 * 1000,
    )
    .slice(0, 3)
    .forEach((t) =>
      items.push({
        key: `assigned-${t.id}`,
        title: `${nameOf(t.created_by)} te passou uma task`,
        body: `“${t.title}”`,
        onClick: onOpenTasks,
      }),
    );

  return (
    <section className="rounded-[18px] border border-black/[0.07] bg-card p-4">
      <h2 className="text-[14px] font-medium tracking-[-0.01em]">Para você</h2>
      {items.length === 0 ? (
        <div className="mt-3 flex items-center gap-3">
          <Mascot pose="estrela" size={40} />
          <p className="text-[13px] leading-[1.45] text-muted-foreground">
            Tudo em dia. Nenhuma call, pedido ou task esperando por você.
          </p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                onClick={it.onClick}
                className={cn(
                  "w-full rounded-[16px] px-3.5 py-3 text-left transition-colors",
                  it.tone === "brand"
                    ? "bg-brand-soft hover:bg-[color-mix(in_oklab,var(--brand-soft),var(--brand)_8%)]"
                    : "bg-[#f5f5f5] hover:bg-[#efefef]",
                )}
              >
                <span className="block text-[14px] font-medium">{it.title}</span>
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  {it.body}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Datas.                                                               */
/* ------------------------------------------------------------------ */

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "short",
});
const shortFmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

function timeOf(iso: string) {
  return timeFmt.format(new Date(iso));
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  const s = dayFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ago(at: string | number) {
  const ms = Date.now() - new Date(at).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return shortFmt.format(new Date(at));
}

function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return timeFmt.format(d);
}

function order(t: Task) {
  return t.status === "doing" ? 0 : t.status === "todo" ? 1 : 2;
}
