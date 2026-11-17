import { useEffect, useMemo, useState } from "react";
import { inviteLink } from "@/lib/invite-link";
import { HambergerMenu, Setting2, UserAdd } from "iconsax-react";
import { X } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useChannels } from "@/lib/clyro-queries";
import { useVoiceStates } from "@/lib/voice-presence";
import { useMeetings, useTasks } from "@/lib/activity-queries";
import { initialsOf, type Profile, type Server } from "@/lib/clyro-types";
import type { Team, WorkspaceMember } from "@/lib/workspace-queries";
import { MediaImage, UserAvatar } from "@/components/clyro/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Mascot } from "./mascot";
import { SECTIONS, type Section } from "./sections";
import { emptyRooms, isCreatedRoom, useRooms } from "@/lib/room-queries";

type SidebarProps = {
  section: Section;
  onSection: (s: Section) => void;
  badges?: Partial<Record<Section, number>>;
  /** A página de perfil está aberta: nenhuma seção fica acesa. */
  profileActive: boolean;
  workspace: Server | null;
  members: WorkspaceMember[];
  teams: Team[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  conversationCount: number;
  canManage: boolean;
  onInvite: () => void;
  /** Opcional: a conta hoje mora no canto superior direito do topo. */
  account?: React.ReactNode;
  /**
   * Só na coluna fixa do desktop: a sidebar pode virar um trilho de ícones.
   * Sem `onToggleCollapsed` (o menu do celular) ela fica sempre larga.
   */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  selfProfile?: Profile | undefined;
  onOpenSelf?: () => void;
  onSettings?: () => void;
};

/**
 * Sidebar larga, no desenho da referência: uma linha por seção, com ícone
 * cheio em cinza. A aberta vira um bloco cinza com o ícone em traço escuro e
 * uma linha viva do que está acontecendo nela. Embaixo, o convite.
 */
export function WorkspaceSidebar(props: SidebarProps) {
  const { collapsed = false, onToggleCollapsed } = props;
  if (!onToggleCollapsed) return <ExpandedSidebar {...props} />;

  /*
   * As duas versões ficam montadas: a coluna estreita enquanto uma some e a
   * outra aparece. A larga tem largura fixa, então o texto nunca quebra de
   * novo no meio da animação; ela só é cortada pela coluna.
   */
  return (
    <div className="relative flex flex-1 flex-col">
      <div
        inert={collapsed}
        aria-hidden={collapsed}
        className={cn(
          "flex w-[208px] flex-1 flex-col transition-[opacity,transform] ease-clyro motion-reduce:transition-none xl:w-[216px]",
          collapsed
            ? "-translate-x-2 opacity-0 duration-150"
            : "translate-x-0 opacity-100 delay-100 duration-300",
        )}
      >
        <ExpandedSidebar {...props} />
      </div>
      <div
        inert={!collapsed}
        aria-hidden={!collapsed}
        className={cn(
          "absolute inset-0 flex flex-col items-center transition-[opacity,transform] ease-clyro motion-reduce:transition-none",
          collapsed
            ? "translate-x-0 opacity-100 delay-100 duration-300"
            : "pointer-events-none translate-x-1 opacity-0 duration-150",
        )}
      >
        <SidebarRail {...props} onToggleCollapsed={onToggleCollapsed} />
      </div>
    </div>
  );
}

const RAIL_ITEM =
  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] outline-none transition-[color,transform] duration-200 ease-clyro hover:text-brand active:scale-95 focus-visible:ring-2 focus-visible:ring-brand";

/** Um botão do trilho com o nome da seção num balão à direita. */
function RailButton({
  label,
  active = false,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={cn(RAIL_ITEM, active ? "text-brand" : "text-foreground", className)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * A sidebar minimizada, no desenho da referência: o botão de abrir, uma
 * coluna de ícones em traço, a seção aberta num quadrado com borda e o número
 * de pendências num selo escuro. Embaixo, ajustes e a sua foto.
 */
function SidebarRail(props: SidebarProps & { onToggleCollapsed: () => void }) {
  const { section, onSection, badges, profileActive, onToggleCollapsed } = props;
  return (
    <div className="flex w-full flex-1 flex-col items-center">
      <RailButton label="Abrir a barra lateral" onClick={onToggleCollapsed}>
        <HambergerMenu size={22} color="currentColor" />
      </RailButton>

      <nav aria-label="Seções" className="mt-5 flex flex-col items-center gap-2.5">
        {SECTIONS.map((s) => {
          const on = !profileActive && section === s.id;
          const badge = badges?.[s.id];
          const Icon = s.icon;
          return (
            <RailButton
              key={s.id}
              label={badge ? `${s.label} (${badge})` : s.label}
              active={on}
              onClick={() => onSection(s.id)}
            >
              {/* A seção aberta fica laranja e cheia; as outras ficam laranja ao passar o mouse. */}
              <Icon size={22} color="currentColor" variant={on ? "Bold" : "Linear"} />
              {!!badge && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] bg-foreground px-1 text-[10.5px] font-semibold tabular-nums text-white ring-2 ring-card">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </RailButton>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3 pt-6">
        {props.onSettings && (
          <RailButton label="Configurações" onClick={props.onSettings}>
            <Setting2 size={22} color="currentColor" variant="Linear" />
          </RailButton>
        )}
        {props.onOpenSelf && (
          <RailButton
            label="Seu perfil"
            onClick={props.onOpenSelf}
            active={profileActive}
            className={cn(
              "rounded-full transition-[box-shadow,transform]",
              profileActive
                ? "shadow-[0_0_0_1.5px_var(--brand)]"
                : "shadow-[0_0_0_1px_rgb(0_0_0/0.08)] hover:shadow-[0_0_0_1.5px_var(--brand)]",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute -left-[19px] top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand transition-[opacity,transform] duration-300 ease-clyro xl:-left-[23px]",
                profileActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
              )}
            />
            <UserAvatar profile={props.selfProfile} size={38} showStatus={false} />
          </RailButton>
        )}
      </div>
    </div>
  );
}

function ExpandedSidebar(props: SidebarProps) {
  const { section, onSection, badges, profileActive, workspace } = props;

  return (
    <div className="flex flex-1 flex-col">
      <nav aria-label="Seções" className="flex flex-col">
        {SECTIONS.map((s) => {
          const on = !profileActive && section === s.id;
          const badge = badges?.[s.id];
          const Icon = s.icon;
          return on ? (
            <div key={s.id} className="rounded-[14px] bg-brand-soft px-3 pb-2.5 pt-1.5">
              <button
                type="button"
                onClick={() => onSection(s.id)}
                aria-current="page"
                className="flex h-7 w-full items-center gap-2.5 rounded-[8px] text-left text-[14px] font-medium tracking-[-0.01em] text-[#c2410c] outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon size={18} color="var(--brand)" variant="Bold" className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                {!!badge && <Badge n={badge} />}
              </button>
              <p className="mt-0.5 text-pretty text-[12.5px] leading-[1.45] text-[#6b6b6b] [&_b]:font-medium [&_b]:text-[#c2410c]">
                <SectionStatus {...props} section={s.id} />
              </p>
            </div>
          ) : (
            <button
              key={s.id}
              type="button"
              onClick={() => onSection(s.id)}
              className="group flex h-9 items-center gap-2.5 rounded-[14px] px-3 text-left text-[14px] tracking-[-0.01em] text-[#737373] outline-none transition-colors duration-200 ease-clyro hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Icon
                size={18}
                color="currentColor"
                variant="Bulk"
                className="shrink-0 text-[#a3a3a3] transition-colors duration-200 group-hover:text-foreground"
              />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {!!badge && <Badge n={badge} />}
            </button>
          );
        })}
      </nav>

      {/* Embaixo, presos ao pé da coluna: o convite e você. */}
      <div className="mt-auto flex flex-col gap-3 pt-6">
        {workspace && (
          <InviteCard workspace={workspace} canManage={props.canManage} onInvite={props.onInvite} />
        )}
        {props.account}
      </div>
    </div>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold tabular-nums text-white">
      {n > 9 ? "9+" : n}
    </span>
  );
}

/** A linha viva de cada seção. Cada uma tem seus próprios dados. */
function SectionStatus(props: SidebarProps) {
  const { section, workspace, members, teams, profiles, userId, conversationCount } = props;
  if (section === "messages") {
    return conversationCount ? (
      <>
        <b>{plural(conversationCount, "conversa", "conversas")}</b> com quem você fala direto
      </>
    ) : (
      <>Nenhuma conversa ainda. Chame alguém do time.</>
    );
  }
  if (!workspace) return <>Crie um workspace para começar.</>;
  if (section === "dashboard")
    return <DashboardStatus workspace={workspace} members={members} profiles={profiles} />;
  if (section === "rooms") return <RoomsStatus workspace={workspace} profiles={profiles} />;
  if (section === "tasks") return <TasksStatus workspace={workspace} userId={userId} />;
  return (
    <>
      <b>{plural(members.length, "pessoa", "pessoas")}</b>{" "}
      {teams.length ? (
        <>
          em <b>{plural(teams.length, "equipe", "equipes")}</b>
        </>
      ) : (
        <>no time, nenhuma equipe ainda</>
      )}
    </>
  );
}

function LiveDot() {
  return (
    <span className="relative mr-2 inline-flex h-2 w-2 -translate-y-px align-middle">
      <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
      <span className="relative h-2 w-2 rounded-full bg-brand" />
    </span>
  );
}

function DashboardStatus({
  workspace,
  members,
  profiles,
}: {
  workspace: Server;
  members: WorkspaceMember[];
  profiles: Map<string, Profile> | undefined;
}) {
  const status = useLiveStatus(workspace, members, profiles);
  return (
    <>
      {status.live && <LiveDot />}
      {status.text}
    </>
  );
}

function RoomsStatus({
  workspace,
  profiles,
}: {
  workspace: Server;
  profiles: Map<string, Profile> | undefined;
}) {
  const { data: channels = [] } = useChannels(workspace.id);
  const { data: rooms = emptyRooms() } = useRooms(workspace.id);
  const states = useVoiceStates();
  const allVoice = channels.filter((c) => c.kind === "voice");
  // A conta segue a aba Salas: só entram as salas que alguém abriu.
  const voice = allVoice.filter((c) => isCreatedRoom(c, channels, rooms));
  const text = channels.length - allVoice.length;
  const busiest = voice
    .map((c) => ({ c, ids: states.filter((s) => s.channel_id === c.id).map((s) => s.user_id) }))
    .sort((a, b) => b.ids.length - a.ids.length)[0];
  if (busiest && busiest.ids.length) {
    const first = profiles?.get(busiest.ids[0] ?? "");
    const name = (first?.display_name || first?.username || "Alguém").split(" ")[0];
    return (
      <>
        <LiveDot />
        {busiest.ids.length === 1 ? (
          <>
            <b>{name}</b> está em <b>{busiest.c.name}</b> agora
          </>
        ) : (
          <>
            <b>{busiest.ids.length} pessoas</b> em <b>{busiest.c.name}</b> agora
          </>
        )}
      </>
    );
  }
  return (
    <>
      <b>{plural(text, "canal", "canais")}</b> de texto e{" "}
      <b>{plural(voice.length, "sala", "salas")}</b> de voz
    </>
  );
}

function TasksStatus({ workspace, userId }: { workspace: Server; userId: string }) {
  const { data } = useTasks(workspace.id);
  if (!data) return <>Carregando suas tasks…</>;
  if (data.missing) return <>As tasks ainda não foram ativadas neste workspace.</>;
  const mine = data.tasks.filter(
    (t) => (t.assignee_id ?? t.created_by) === userId && t.status !== "done",
  );
  const doing = mine.filter((t) => t.status === "doing").length;
  if (!mine.length) return <>Nada pendente para você agora.</>;
  return (
    <>
      <b>{plural(mine.length, "task aberta", "tasks abertas")}</b> para você
      {doing > 0 && (
        <>
          , <b>{doing}</b> em andamento
        </>
      )}
    </>
  );
}

/**
 * Ícone do workspace no traço da referência: os de fora são um glifo cinza
 * cheio; o aberto é um anel escuro com a inicial dentro.
 */
export function WorkspaceIcon({
  workspace,
  muted = false,
  size = 22,
}: {
  workspace: Server;
  muted?: boolean;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold leading-none tracking-normal transition-[filter,opacity,background-color,color,box-shadow] duration-200",
        workspace.icon_url
          ? muted && "opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0"
          : muted
            ? "bg-[#a8a8a8] text-white group-hover:bg-foreground"
            : "text-foreground shadow-[inset_0_0_0_1.75px_currentColor]",
      )}
      style={{ width: size, height: size }}
    >
      {workspace.icon_url ? (
        <MediaImage src={workspace.icon_url} className="h-full w-full object-cover" />
      ) : (
        // Uma letra só: no glifo de 22px duas iniciais viram borrão.
        initialsOf(workspace.name).slice(0, 1)
      )}
    </span>
  );
}

/** Relógio de minuto em minuto, para a contagem até a próxima reunião. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 horas e 42 minutos", "1 dia e 3 horas", "8 minutos". */
function countdown(ms: number) {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0)
    return hours
      ? `${plural(days, "dia", "dias")} e ${plural(hours, "hora", "horas")}`
      : plural(days, "dia", "dias");
  if (hours > 0)
    return mins
      ? `${plural(hours, "hora", "horas")} e ${plural(mins, "minuto", "minutos")}`
      : plural(hours, "hora", "horas");
  return plural(mins, "minuto", "minutos");
}

/**
 * A linha viva do workspace aberto: quem está em call agora, senão quanto
 * falta para a próxima reunião, senão quantas pessoas estão online.
 */
function useLiveStatus(
  workspace: Server,
  members: WorkspaceMember[],
  profiles: Map<string, Profile> | undefined,
): { live: boolean; text: React.ReactNode } {
  const { data: channels = [] } = useChannels(workspace.id);
  const states = useVoiceStates();
  const { data: meetingData } = useMeetings(workspace.id);
  const now = useMinuteClock();

  const rooms = useMemo(() => {
    const voice = channels.filter((c) => c.kind === "voice");
    return voice
      .map((c) => ({
        name: c.name,
        ids: states.filter((s) => s.channel_id === c.id).map((s) => s.user_id),
      }))
      .filter((r) => r.ids.length > 0)
      .sort((a, b) => b.ids.length - a.ids.length);
  }, [channels, states]);

  const inCall = rooms.reduce((n, r) => n + r.ids.length, 0);
  const nameOf = (id: string) =>
    (profiles?.get(id)?.display_name || profiles?.get(id)?.username || "Alguém").split(" ")[0];

  if (inCall > 0 && rooms[0]) {
    const room = rooms[0];
    return {
      live: true,
      text:
        inCall === 1 ? (
          <>
            <b>{nameOf(room.ids[0] ?? "")}</b> está em call em <b>{room.name}</b>
          </>
        ) : (
          <>
            <b>{inCall} pessoas</b> em call agora
            {rooms.length === 1 ? (
              <>
                {" "}
                em <b>{room.name}</b>
              </>
            ) : (
              <>
                {" "}
                em <b>{rooms.length} salas</b>
              </>
            )}
          </>
        ),
    };
  }

  const meetings = meetingData?.meetings ?? [];
  const ongoing = meetings.find((m) => {
    const start = new Date(m.starts_at).getTime();
    return start <= now && now < start + m.duration_min * 60_000;
  });
  if (ongoing) {
    return {
      live: true,
      text: (
        <>
          <b>{ongoing.title}</b> está acontecendo agora
        </>
      ),
    };
  }
  const next = meetings.find((m) => new Date(m.starts_at).getTime() > now);
  if (next) {
    return {
      live: false,
      text: (
        <>
          Próxima reunião em <b>{countdown(new Date(next.starts_at).getTime() - now)}</b>
        </>
      ),
    };
  }

  const online = members.filter((m) => {
    const s = profiles?.get(m.user_id)?.status;
    return s === "online" || s === "dnd";
  }).length;
  return {
    live: false,
    text: (
      <>
        <b>{plural(members.length, "pessoa", "pessoas")}</b> no time,{" "}
        <b>{online === 0 ? "ninguém" : online}</b> online agora
      </>
    ),
  };
}

/* ------------------------------------------------------------------ */

function readDismissed(id: string) {
  try {
    return window.localStorage.getItem(`clyro:invite-card:${id}`) === "1";
  } catch {
    return false;
  }
}

/** O cartão pastel do convite: some quando você fecha, por workspace. */
function InviteCard({
  workspace,
  canManage,
  onInvite,
}: {
  workspace: Server;
  canManage: boolean;
  onInvite: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(readDismissed(workspace.id)), [workspace.id]);
  const [copied, setCopied] = useState(false);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(`clyro:invite-card:${workspace.id}`, "1");
    } catch {
      /* sem armazenamento, o cartão volta no próximo carregamento */
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteLink(workspace.invite_code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="relative pt-2">
      {/* Um segundo cartão aparece atrás, como uma pilha. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-3 top-0 h-6 rounded-t-[14px] border border-black/[0.07] bg-card"
      />
      <section className="group/card relative overflow-hidden rounded-[16px] border border-black/[0.08] bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_14px_-10px_rgb(0_0_0/0.14)]">
        <button
          type="button"
          onClick={() => (canManage ? onInvite() : void copy())}
          className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <TileGrid />
          <span className="block px-3.5 pb-3.5 pt-3">
            <span className="block text-[13.5px] font-medium tracking-[-0.01em] text-foreground">
              Convide seu time
            </span>
            <span className="mt-1 block text-[12.5px] leading-[1.45] text-[#737373]">
              {canManage
                ? `Chame quem vai construir com você. Quem entra cai direto em ${workspace.name}.`
                : copied
                  ? "Link copiado. Quem abrir entra direto no workspace."
                  : "Toque para copiar o link de convite e mande para quem vai somar."}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fechar convite"
          className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-[#9a9a9a] transition-[color,background-color,transform] duration-200 ease-clyro hover:bg-black/[0.04] hover:text-foreground active:scale-90"
        >
          <X size={15} />
        </button>
      </section>
    </div>
  );
}

/**
 * O quadriculado do topo do cartão: três ladrilhos brancos na diagonal, o do
 * meio com o convite em laranja, e duas casas hachuradas atrás dele.
 */
function TileGrid() {
  return (
    <span
      aria-hidden="true"
      className="relative block h-[104px] overflow-hidden border-b border-black/[0.06] bg-[#fafafa] [background-image:linear-gradient(rgb(0_0_0/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(0_0_0/0.05)_1px,transparent_1px)] [background-position:-1px_-1px] [background-size:25%_52px]"
    >
      <span className="absolute left-1/4 top-[52px] h-[52px] w-1/2 [background-image:repeating-linear-gradient(135deg,rgb(0_0_0/0.06)_0_1px,transparent_1px_6px)]" />
      <Tile className="left-[calc(25%-2px)] top-[-14px]">
        <Mascot pose="estrela" size={30} />
      </Tile>
      <Tile className="left-[calc(50%-22px)] top-[30px] z-10">
        <UserAdd size={24} color="var(--brand)" variant="Bold" />
      </Tile>
      <Tile className="left-[calc(75%-30px)] top-[76px]">
        <Mascot pose="sorte" size={30} />
      </Tile>
    </span>
  );
}

function Tile({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "absolute flex h-11 w-11 items-center justify-center rounded-[12px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.05),0_6px_12px_-6px_rgb(0_0_0/0.16)] transition-transform duration-300 ease-clyro group-hover/card:-translate-y-0.5",
        className,
      )}
    >
      {children}
    </span>
  );
}
