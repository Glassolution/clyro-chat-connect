import { useState } from "react";
import { ArrowDown2, Flash } from "iconsax-react";
import { Check, Plus, UserPlus } from "@/components/icons";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Channel, Profile, Server } from "@/lib/clyro-types";
import type { Team, WorkspaceInvite, WorkspaceMember } from "@/lib/workspace-queries";
import { useActivityRealtime } from "@/lib/activity-queries";
import { EmptyState } from "./mascot";
import { AvatarStack, PendingInvites, TeamCard } from "./team-panel";
import { FEED_FILTERS, useFeed, type FeedKind } from "@/lib/activity-feed";
import { ActivityFeed, BoardAside } from "./activity-board";
import type { Section } from "./sections";
import { AccessRequests } from "./access-requests";
import type { AccessQuestion, AccessRequest } from "@/lib/project-queries";

type View = "feed" | "teams" | "invites" | "requests";

function isActive(p: Profile | undefined) {
  return p?.status === "online" || p?.status === "dnd";
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "16 nov 26", no jeito curto da referência. */
function shortDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

/**
 * O Painel: um seletor em pílula escolhe o que ver, e o feed conta o que o
 * time fez, um cartão por acontecimento. Ao lado, o que pede a sua atenção.
 */
export function Dashboard({
  workspace,
  members,
  teams,
  invites,
  profiles,
  userId,
  canManage,
  canReview = canManage,
  onInvite,
  onCreateTeam,
  onJoinVoice,
  onOpenChannel,
  onNavigate,
  onOpenProfile,
  requests,
  questions,
}: {
  workspace: Server;
  members: WorkspaceMember[];
  teams: Team[];
  invites: WorkspaceInvite[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  canManage: boolean;
  /** Ver e responder pedidos de entrada: só o dono do workspace. */
  canReview?: boolean;
  onInvite: (teamId?: string) => void;
  onCreateTeam: () => void;
  onJoinVoice: (channel: Channel) => void;
  onOpenChannel: (channelId: string) => void;
  onNavigate: (section: Section) => void;
  onOpenProfile: (id: string) => void;
  requests: AccessRequest[];
  questions: AccessQuestion[];
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("feed");
  const [filter, setFilter] = useState<FeedKind | "all">("all");
  useActivityRealtime(workspace.id);
  const { events, data } = useFeed({ workspace, members, teams, invites, requests, canManage });

  const online = members.filter((m) => isActive(profiles?.get(m.user_id))).length;
  const countOf = (f: FeedKind | "all") =>
    f === "all" ? events.length : events.filter((e) => e.kind === f).length;

  const views: { id: Exclude<View, "feed">; label: string; count: number }[] = [
    { id: "teams", label: "Equipes", count: teams.length },
    { id: "invites", label: "Convites pendentes", count: invites.length },
    ...(canReview
      ? [{ id: "requests" as const, label: "Pedidos de acesso", count: requests.length }]
      : []),
  ];

  const pill =
    view === "feed"
      ? {
          label:
            filter === "all"
              ? "Atividade"
              : (FEED_FILTERS.find((f) => f.id === filter)?.label ?? ""),
          count: countOf(filter),
        }
      : (views.find((v) => v.id === view) ?? { label: "", count: 0 });

  const openRequests = () => setView("requests");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto clyro-scroll">
      <div className="grid content-start items-start gap-x-6 gap-y-5 p-4 pb-8 sm:p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* Seletor em pílula e a data, como a cabeça do feed. */}
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-foreground/[0.09] bg-card pl-3 pr-3 text-[14px] font-medium tracking-[-0.01em] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_3px_8px_-6px_rgb(0_0_0/0.12)] outline-none transition-[border-color,transform] duration-200 ease-clyro hover:border-foreground/20 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:border-foreground/20"
                >
                  <Flash size={16} color="var(--brand)" variant="Bold" className="shrink-0" />
                  <span className="truncate">{pill.label}</span>
                  <span className="font-normal tabular-nums text-ink-ghost">
                    {String(pill.count).padStart(2, "0")}
                  </span>
                  <ArrowDown2
                    size={13}
                    color="currentColor"
                    className="shrink-0 text-muted-foreground transition-transform duration-200 ease-clyro group-data-[state=open]:rotate-180"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="w-60 rounded-[16px] p-1.5"
              >
                <DropdownMenuLabel className="px-2.5 text-[12px] font-normal text-muted-foreground">
                  Atividade do time
                </DropdownMenuLabel>
                {FEED_FILTERS.map((f) => (
                  <PillItem
                    key={f.id}
                    label={f.label}
                    count={countOf(f.id)}
                    selected={view === "feed" && filter === f.id}
                    onSelect={() => {
                      setView("feed");
                      setFilter(f.id);
                    }}
                  />
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2.5 text-[12px] font-normal text-muted-foreground">
                  Gerenciar
                </DropdownMenuLabel>
                {views.map((v) => (
                  <PillItem
                    key={v.id}
                    label={v.label}
                    count={v.count}
                    selected={view === v.id}
                    highlight={v.id === "requests" && v.count > 0}
                    onSelect={() => setView(v.id)}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {view !== "feed" && canManage && view !== "requests" && (
              <button
                type="button"
                onClick={() => (view === "teams" ? onCreateTeam() : onInvite())}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium transition-colors hover:bg-secondary"
              >
                {view === "teams" ? <Plus size={16} /> : <UserPlus size={16} />}
                <span className="hidden sm:inline">
                  {view === "teams" ? "Nova equipe" : "Convidar"}
                </span>
              </button>
            )}

            <span className="ml-auto shrink-0 text-[13.5px] tabular-nums text-muted-foreground">
              {shortDate(new Date())}
            </span>
          </div>

          {view === "feed" && (
            <ActivityFeed
              workspace={workspace}
              events={events}
              data={data}
              filter={filter}
              members={members}
              teams={teams}
              profiles={profiles}
              userId={userId}
              onJoinVoice={onJoinVoice}
              onOpenChannel={onOpenChannel}
              onOpenProfile={onOpenProfile}
              onOpenRequests={openRequests}
            />
          )}

          {view === "teams" &&
            (teams.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {teams.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    profiles={profiles}
                    canManage={canManage}
                    onInvite={() => onInvite(team.id)}
                    onDelete={async () => {
                      if (!window.confirm(`Apagar a equipe ${team.name}?`)) return;
                      await supabase.from("teams").delete().eq("id", team.id);
                      void qc.invalidateQueries({ queryKey: ["teams", workspace.id] });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-foreground/[0.07]">
                <EmptyState
                  pose="estrela"
                  title="Nenhuma equipe ainda"
                  body="Produto, engenharia, vendas… separe o time e veja quem cuida do quê."
                  action={
                    canManage && (
                      <Button className="rounded-full" onClick={onCreateTeam}>
                        <Plus size={16} /> Criar equipe
                      </Button>
                    )
                  }
                />
              </div>
            ))}

          {view === "requests" && canReview && (
            <AccessRequests serverId={workspace.id} requests={requests} questions={questions} />
          )}

          {view === "invites" && (
            <PendingInvites
              invites={invites}
              teams={teams}
              profiles={profiles}
              canManage={canManage}
              onInvite={() => onInvite()}
            />
          )}
        </div>

        {/* Coluna lateral: o que pede atenção, tasks, agenda e o time. */}
        <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-0">
          <BoardAside
            workspace={workspace}
            data={data}
            members={members}
            requests={requests}
            profiles={profiles}
            userId={userId}
            canManage={canManage}
            onJoinVoice={onJoinVoice}
            onOpenTasks={() => onNavigate("tasks")}
            onOpenRequests={openRequests}
          />

          <section className="rounded-[18px] border border-foreground/[0.07] bg-card p-4">
            <h3 className="text-[14px] font-medium tracking-[-0.01em]">Sobre o workspace</h3>
            <p className="mt-1.5 text-pretty text-[13px] leading-[1.5] text-muted-foreground">
              {workspace.description ||
                "Conte para o time o que vocês estão construindo. Por enquanto, o importante: todo mundo no mesmo lugar, sabendo quem faz o quê."}
            </p>
            <dl className="mt-3 flex gap-5 text-[13px]">
              <Stat value={members.length} label={members.length === 1 ? "pessoa" : "pessoas"} />
              <Stat value={online} label="online" />
              <Stat value={teams.length} label={teams.length === 1 ? "equipe" : "equipes"} />
            </dl>
            {members.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate("team")}
                className="group mt-3 flex w-full items-center gap-2.5 rounded-[16px] text-left"
              >
                <AvatarStack
                  ids={members.map((m) => m.user_id)}
                  profiles={profiles}
                  max={6}
                  size={26}
                />
                <span className="text-[13px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                  Ver o time
                </span>
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function PillItem({
  label,
  count,
  selected,
  highlight = false,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  highlight?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn("h-9 rounded-[10px] px-2.5 text-[13.5px]", selected && "font-medium")}
    >
      <span className="flex w-4 shrink-0 justify-center">{selected && <Check size={14} />}</span>
      <span className="flex-1 truncate">{label}</span>
      <span
        className={cn(
          "text-[13px] tabular-nums",
          highlight ? "font-semibold text-brand" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </DropdownMenuItem>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
      <dd className="text-muted-foreground">{label}</dd>
    </div>
  );
}
