import { useMemo, useState } from "react";
import { Check, Copy, KeyRound, LogOut, MoreHorizontal, Plus, UserPlus } from "@/components/icons";
import { Edit, Global } from "iconsax-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile, Server } from "@/lib/clyro-types";
import type { Team, WorkspaceInvite, WorkspaceMember } from "@/lib/workspace-queries";
import { MediaImage } from "@/components/clyro/primitives";
import { EmptyState, Mascot } from "./mascot";
import { MemberCard, PendingInvites, TeamCard } from "./team-panel";
import { AccessRequests } from "./access-requests";
import type { AccessQuestion, AccessRequest } from "@/lib/project-queries";

type Tab = "now" | "teams" | "invites" | "requests";

function isActive(p: Profile | undefined) {
  return p?.status === "online" || p?.status === "dnd";
}

/**
 * O painel do workspace. À esquerda, o "cartão" do workspace — saudação, ícone,
 * convite e números do time —; à direita, quem está fazendo o quê agora.
 */
export function Dashboard({
  workspace,
  profile,
  members,
  teams,
  invites,
  profiles,
  userId,
  canManage,
  unread,
  onInvite,
  onCreateTeam,
  onOpenRooms,
  onOpenProfile,
  onLeft,
  requests,
  questions,
  onEditProject,
  onViewProject,
}: {
  workspace: Server;
  profile: Profile | undefined;
  members: WorkspaceMember[];
  teams: Team[];
  invites: WorkspaceInvite[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  canManage: boolean;
  unread: number;
  onInvite: (teamId?: string) => void;
  onCreateTeam: () => void;
  onOpenRooms: () => void;
  onOpenProfile: (id: string) => void;
  onLeft: () => void;
  requests: AccessRequest[];
  questions: AccessQuestion[];
  onEditProject: () => void;
  onViewProject: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(canManage && requests.length ? "requests" : "now");
  const [copied, setCopied] = useState(false);
  const firstName = (profile?.display_name || profile?.username || "").split(" ")[0];

  const online = members.filter((m) => isActive(profiles?.get(m.user_id))).length;

  // Quem está em atividade primeiro, depois online, depois o resto.
  const sorted = useMemo(
    () =>
      [...members].sort((a, b) => {
        const pa = profiles?.get(a.user_id);
        const pb = profiles?.get(b.user_id);
        const score = (p: Profile | undefined) => (p?.activity ? 2 : 0) + (isActive(p) ? 1 : 0);
        return score(pb) - score(pa);
      }),
    [members, profiles],
  );

  const copyCode = async () => {
    await navigator.clipboard.writeText(workspace.invite_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const leave = async () => {
    if (!window.confirm(`Sair de ${workspace.name}?`)) return;
    const { error } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", workspace.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Não foi possível sair.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["servers", userId] });
    onLeft();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-8 sm:px-8 lg:flex-row clyro-scroll">
      {/* Coluna do workspace */}
      <aside className="flex w-full shrink-0 flex-col items-center rounded-[32px] bg-background px-6 pb-6 pt-6 lg:sticky lg:top-0 lg:w-[400px] lg:self-start">
        <div className="flex w-full items-center justify-between">
          <span className="text-[15px] text-muted-foreground">Olá, {firstName}!</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl" aria-label="Opções">
                <MoreHorizontal size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onViewProject}>
                <Global size={14} /> Ver página do projeto
              </DropdownMenuItem>
              {canManage && (
                <DropdownMenuItem onClick={onEditProject}>
                  <Edit size={14} /> Editar projeto
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void copyCode()}>
                <KeyRound size={14} /> Copiar código de entrada
              </DropdownMenuItem>
              {workspace.owner_id !== userId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => void leave()}>
                    <LogOut size={14} /> Sair do workspace
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-2 flex h-32 w-32 items-center justify-center overflow-hidden rounded-[32px] bg-card shadow-card">
          {workspace.icon_url ? (
            <MediaImage src={workspace.icon_url} className="h-full w-full object-cover" />
          ) : (
            <Mascot pose="neutro" size={92} />
          )}
        </div>

        <h2 className="mt-5 text-center text-2xl font-bold tracking-tight">{workspace.name}</h2>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          {members.length} {members.length === 1 ? "pessoa" : "pessoas"} no time
        </p>

        <div className="mt-6 grid w-full grid-cols-2 gap-3">
          <Button
            className="h-14 rounded-2xl text-base"
            onClick={() => (canManage ? onInvite() : void copyCode())}
          >
            {canManage ? "Convidar" : "Copiar código"}
          </Button>
          <Button
            variant="outline"
            className="h-14 justify-between rounded-2xl border-transparent bg-card px-6 text-base shadow-card hover:bg-card"
            onClick={onOpenRooms}
          >
            Salas
            {unread > 0 && <span className="text-sm font-semibold">{unread}</span>}
          </Button>
        </div>

        <div className="mt-7 flex w-full items-center justify-center gap-8">
          <Stat value={online} label="Online agora" />
          <span className="h-10 w-px bg-foreground/80" />
          <Stat value={teams.length} label={teams.length === 1 ? "Equipe" : "Equipes"} />
        </div>

        <button
          type="button"
          onClick={() => void copyCode()}
          className="mt-7 flex h-14 w-full items-center gap-4 rounded-2xl border border-border px-5 text-left transition-colors hover:bg-card"
        >
          <KeyRound size={20} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate font-mono text-[15px] font-medium underline underline-offset-4">
            {workspace.invite_code}
          </span>
          {copied ? <Check size={20} /> : <Copy size={20} />}
        </button>

        <div className="mt-5 w-full rounded-[28px] bg-card px-7 pb-4 pt-7 text-center">
          <h3 className="text-lg font-semibold">Sobre o workspace</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-foreground/80">
            {workspace.description ||
              "Conte para o time o que vocês estão construindo. Por enquanto, o importante: todo mundo no mesmo lugar, sabendo quem faz o quê."}
          </p>
          <Button
            variant="ghost"
            className="mt-4 h-12 w-full rounded-2xl shadow-card"
            onClick={() => setTab("teams")}
          >
            Ver equipes
          </Button>
        </div>
      </aside>

      {/* Coluna do time */}
      <section className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3 pb-5">
          <TabButton active={tab === "now"} onClick={() => setTab("now")}>
            Agora
          </TabButton>
          <TabButton active={tab === "teams"} onClick={() => setTab("teams")}>
            Equipes
          </TabButton>
          <TabButton active={tab === "invites"} onClick={() => setTab("invites")}>
            Convites
            {invites.length > 0 && (
              <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">
                {invites.length}
              </span>
            )}
          </TabButton>
          {canManage && (
            <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>
              Pedidos
              {requests.length > 0 && (
                <span className="ml-2 rounded-full bg-white/90 px-2 py-0.5 text-xs text-brand">
                  {requests.length}
                </span>
              )}
            </TabButton>
          )}
          {canManage && tab !== "requests" && (
            <Button
              variant="ghost"
              className="ml-auto h-12 rounded-2xl"
              onClick={() => (tab === "teams" ? onCreateTeam() : onInvite())}
            >
              {tab === "teams" ? <Plus size={18} /> : <UserPlus size={18} />}
              {tab === "teams" ? "Nova equipe" : "Convidar"}
            </Button>
          )}
        </div>

        {tab === "now" &&
          (members.length <= 1 ? (
            <div className="ws-card">
              <EmptyState
                pose="energia"
                title="Só você por aqui"
                body="Chame o time para ver quem está online, o que cada um está fazendo e combinar o dia."
                action={
                  canManage && (
                    <Button className="rounded-2xl" onClick={() => onInvite()}>
                      <UserPlus size={16} /> Convidar pessoas
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {sorted.map((m) => (
                <MemberCard
                  key={m.user_id}
                  member={m}
                  profile={profiles?.get(m.user_id)}
                  teams={teams.filter((t) => t.member_ids.includes(m.user_id))}
                  isSelf={m.user_id === userId}
                  onOpen={() => onOpenProfile(m.user_id)}
                />
              ))}
            </div>
          ))}

        {tab === "teams" &&
          (teams.length ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
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
            <div className="ws-card">
              <EmptyState
                pose="estrela"
                title="Nenhuma equipe ainda"
                body="Produto, engenharia, vendas… separe o time e veja quem cuida do quê."
                action={
                  canManage && (
                    <Button className="rounded-2xl" onClick={onCreateTeam}>
                      <Plus size={16} /> Criar equipe
                    </Button>
                  )
                }
              />
            </div>
          ))}

        {tab === "requests" && canManage && (
          <AccessRequests serverId={workspace.id} requests={requests} questions={questions} />
        )}

        {tab === "invites" && (
          <PendingInvites
            invites={invites}
            teams={teams}
            profiles={profiles}
            canManage={canManage}
            onInvite={() => onInvite()}
          />
        )}
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[15px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Aba em pílula: a ativa é azul, como o "Posts" da referência. */
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
      onClick={onClick}
      className={cn(
        "flex h-12 min-w-[8.5rem] items-center justify-center rounded-2xl px-6 text-[15px] font-medium transition-colors duration-200",
        active ? "bg-brand text-white" : "bg-card text-foreground shadow-card hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
