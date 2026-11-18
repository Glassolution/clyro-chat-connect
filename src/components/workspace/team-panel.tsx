import { useMemo, useState } from "react";
import {
  ChevronDown,
  Crown,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from "@/components/icons";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABEL, type Profile, type Server } from "@/lib/clyro-types";
import {
  ROLE_LABEL,
  TEAM_COLORS,
  TEAM_COLOR_STYLE,
  errorMessage,
  type Team,
  type TeamColor,
  type WorkspaceInvite,
  type WorkspaceMember,
} from "@/lib/workspace-queries";
import { useTasks } from "@/lib/activity-queries";
import { useLiveActivity } from "@/lib/voice-presence";
import { StatusDot, UserAvatar } from "@/components/clyro/primitives";
import { EmptyState } from "./mascot";

export function TeamChip({ team, className }: { team: Team; className?: string }) {
  const style = TEAM_COLOR_STYLE[team.color];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        className,
      )}
      style={{ background: style.bg, color: style.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.dot }} />
      {team.name}
    </span>
  );
}

/** O que a pessoa está fazendo agora, em uma linha. */
export function activityLine(profile: Profile | undefined, live?: string | null) {
  if (!profile) return "";
  const activity = live === undefined ? profile.activity : live;
  if (activity) return activity;
  return STATUS_LABEL[profile.status] ?? "Offline";
}

/** Rótulo do status para quem está fora: "invisível" conta como offline. */
function presenceOf(profile: Profile | undefined): "online" | "idle" | "dnd" | "offline" {
  const s = profile?.status;
  return s === "online" || s === "idle" || s === "dnd" ? s : "offline";
}

const PRESENCE_LABEL = {
  online: "Online",
  idle: "Ausente",
  dnd: "Não perturbe",
  offline: "Offline",
} as const;

type TaskLoad = { done: number; total: number; doing: string | null };

/**
 * Cartão de pessoa da página Equipe: foto, nome, papel, o andamento das tasks
 * dela (feitas de quantas) e, embaixo, o que está fazendo agora.
 */
export function MemberCard({
  member,
  profile,
  load,
  color,
  isSelf,
  onOpen,
  menu,
}: {
  member: WorkspaceMember;
  profile: Profile | undefined;
  load: TaskLoad | undefined;
  /** Cor da barra: a da equipe do grupo. */
  color: string;
  isSelf: boolean;
  onOpen?: () => void;
  menu?: React.ReactNode;
}) {
  const presence = presenceOf(profile);
  const activityOf = useLiveActivity();
  const total = load?.total ?? 0;
  const done = load?.done ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const now = load?.doing ?? activityOf(profile) ?? null;
  return (
    <div className="ws-card group relative flex flex-col p-4 clyro-lift">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label="Ver perfil"
        >
          <UserAvatar profile={profile} size={44} />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full truncate text-left text-[14.5px] font-semibold tracking-[-0.01em] outline-none hover:underline focus-visible:underline"
          >
            {profile?.display_name || profile?.username || "Alguém"}
            {isSelf && <span className="font-normal text-muted-foreground"> (você)</span>}
          </button>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-muted-foreground">
            {member.role === "owner" && <Crown size={12} />}
            {member.role === "admin" && <ShieldCheck size={12} />}
            {ROLE_LABEL[member.role]}
            {profile?.username && <span className="truncate">· @{profile.username}</span>}
          </p>
        </div>
        {menu}
      </div>

      <div className="mt-4">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]"
          role="progressbar"
          aria-label="Tasks feitas"
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-clyro"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        <p className="mt-2 text-[12.5px] tabular-nums text-muted-foreground">
          {total ? (
            <>
              <span className="font-medium text-foreground">
                {done}/{total}
              </span>{" "}
              {total === 1 ? "task" : "tasks"} · {pct}%
            </>
          ) : (
            "Sem tasks ainda"
          )}
        </p>
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-2 rounded-[12px] bg-secondary px-3 py-2 text-[13px]">
        <StatusDot status={profile?.status} className="h-2 w-2 ring-0" />
        <span className={cn("truncate", now ? "text-foreground" : "text-muted-foreground")}>
          {now ?? PRESENCE_LABEL[presence]}
        </span>
      </div>
    </div>
  );
}

/** Pilha de avatares sobrepostos, com "+N" no fim. */
export function AvatarStack({
  ids,
  profiles,
  max = 5,
  size = 32,
}: {
  ids: string[];
  profiles: Map<string, Profile> | undefined;
  max?: number;
  size?: number;
}) {
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((id, i) => (
        <span
          key={id}
          className="rounded-full ring-[3px] ring-card"
          style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}
        >
          <UserAvatar profile={profiles?.get(id)} size={size} showStatus={false} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-secondary text-xs font-semibold ring-[3px] ring-card"
          style={{ width: size, height: size, marginLeft: -size * 0.3 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export function TeamCard({
  team,
  profiles,
  canManage,
  onInvite,
  onDelete,
}: {
  team: Team;
  profiles: Map<string, Profile> | undefined;
  canManage: boolean;
  onInvite: () => void;
  onDelete: () => void;
}) {
  const style = TEAM_COLOR_STYLE[team.color];
  const online = team.member_ids.filter((id) => {
    const s = profiles?.get(id)?.status;
    return s === "online" || s === "dnd";
  }).length;
  return (
    <div className="ws-card flex flex-col gap-4 p-5 clyro-lift">
      <div className="flex items-start gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
          style={{ background: style.bg, color: style.fg }}
        >
          {team.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold">{team.name}</h3>
          <p className="text-xs text-muted-foreground">
            {team.member_ids.length} {team.member_ids.length === 1 ? "pessoa" : "pessoas"} ·{" "}
            {online} online
          </p>
        </div>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-1 rounded-xl">
                <MoreHorizontal size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onInvite}>
                <UserPlus size={14} /> Chamar para a equipe
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <X size={14} /> Apagar equipe
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {team.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{team.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2">
        {team.member_ids.length ? (
          <AvatarStack ids={team.member_ids} profiles={profiles} />
        ) : (
          <span className="text-sm text-muted-foreground">Ninguém ainda</span>
        )}
        {canManage && (
          <Button size="sm" variant="secondary" className="rounded-xl" onClick={onInvite}>
            <Plus size={14} /> Adicionar
          </Button>
        )}
      </div>
    </div>
  );
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  workspaceId,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  userId: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<TeamColor>("blue");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("teams").insert({
      server_id: workspaceId,
      name: name.trim(),
      description: description.trim() || null,
      color,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error, "Não foi possível criar a equipe."));
      return;
    }
    toast.success("Equipe criada.");
    setName("");
    setDescription("");
    onOpenChange(false);
    void qc.invalidateQueries({ queryKey: ["teams", workspaceId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-[28px] p-7">
        <DialogTitle className="text-xl font-semibold tracking-tight">Nova equipe</DialogTitle>
        <DialogDescription>
          Um grupo de gente que trabalha junto: produto, vendas, design…
        </DialogDescription>
        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Nome</Label>
            <Input
              id="team-name"
              autoFocus
              value={name}
              maxLength={48}
              placeholder="Ex.: Engenharia"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-desc">Do que ela cuida (opcional)</Label>
            <Textarea
              id="team-desc"
              rows={2}
              value={description}
              maxLength={160}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex gap-2">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-9 w-9 rounded-full transition-transform",
                    color === c && "scale-110 ring-2 ring-primary ring-offset-2 ring-offset-card",
                  )}
                  style={{ background: TEAM_COLOR_STYLE[c].dot }}
                />
              ))}
            </div>
          </div>
          <Button
            className="h-11 w-full rounded-2xl"
            disabled={busy || !name.trim()}
            onClick={() => void create()}
          >
            Criar equipe
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PendingInvites({
  invites,
  teams,
  profiles,
  canManage,
  onInvite,
}: {
  invites: WorkspaceInvite[];
  teams: Team[];
  profiles: Map<string, Profile> | undefined;
  canManage: boolean;
  onInvite: () => void;
}) {
  const qc = useQueryClient();

  const revoke = async (invite: WorkspaceInvite) => {
    const { error } = await supabase
      .from("workspace_invites")
      .update({ status: "revoked" })
      .eq("id", invite.id);
    if (error) {
      toast.error("Não foi possível cancelar o convite.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["workspace-invites", invite.server_id] });
  };

  if (invites.length === 0) {
    return (
      <EmptyState
        pose="chuva"
        title="Nenhum convite esperando"
        body="Quem você convidar aparece aqui até aceitar."
        action={
          canManage && (
            <Button className="rounded-2xl" onClick={onInvite}>
              <UserPlus size={16} /> Convidar pessoas
            </Button>
          )
        }
      />
    );
  }

  return (
    <ul className="space-y-2">
      {invites.map((inv) => {
        const person = inv.user_id ? profiles?.get(inv.user_id) : undefined;
        const team = teams.find((t) => t.id === inv.team_id);
        return (
          <li key={inv.id} className="ws-card flex items-center gap-3 p-4">
            {person ? (
              <UserAvatar profile={person} size={40} showStatus={false} />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <Mail size={16} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {person ? person.display_name || person.username : inv.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {inv.role === "admin" ? "Admin" : "Membro"}
                {team && ` · ${team.name}`} · enviado por{" "}
                {profiles?.get(inv.invited_by)?.display_name ?? "alguém"}
              </p>
            </div>
            {team && <TeamChip team={team} className="hidden sm:inline-flex" />}
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl text-muted-foreground"
                onClick={() => void revoke(inv)}
              >
                Cancelar
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type RoleFilter = "owner" | "admin" | "member";
type PresenceFilter = keyof typeof PRESENCE_LABEL;

/** Um filtro em forma de chip que abre a lista de opções. */
function FilterChip<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; dot?: string }[];
  onChange: (value: T | null) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-medium outline-none transition-[background-color,border-color,color,transform] duration-150 ease-clyro focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.97] data-[state=open]:border-foreground/20",
            current
              ? "border-foreground bg-foreground text-background"
              : "border-foreground/[0.08] bg-card text-foreground hover:border-foreground/15",
          )}
        >
          {current?.dot && (
            <span className="h-2 w-2 rounded-full" style={{ background: current.dot }} />
          )}
          {current ? current.label : label}
          <ChevronDown size={14} className="opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? "__all"}
          onValueChange={(v) => onChange(v === "__all" ? null : (v as T))}
        >
          <DropdownMenuRadioItem value="__all" className="rounded-xl">
            Todos
          </DropdownMenuRadioItem>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="gap-2 rounded-xl">
              {o.dot && <span className="h-2 w-2 rounded-full" style={{ background: o.dot }} />}
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLE_ORDER: Record<RoleFilter, number> = { owner: 0, admin: 1, member: 2 };
const NO_TEAM_COLOR = TEAM_COLOR_STYLE.slate.dot;

/**
 * Página "Equipe": o time agrupado por equipe, com filtros por papel, status e
 * equipe, o andamento das tasks de cada pessoa e o que ela está fazendo. Quem
 * administra também troca papel, move entre equipes e remove.
 */
export function TeamManager({
  workspace,
  members,
  teams,
  invites,
  profiles,
  userId,
  canManage,
  onInvite,
  onCreateTeam,
  onOpenProfile,
}: {
  workspace: Server;
  members: WorkspaceMember[];
  teams: Team[];
  invites: WorkspaceInvite[];
  profiles: Map<string, Profile> | undefined;
  userId: string;
  canManage: boolean;
  onInvite: (teamId?: string) => void;
  onCreateTeam: () => void;
  onOpenProfile: (id: string) => void;
}) {
  const qc = useQueryClient();
  const tasksQ = useTasks(workspace.id);
  const [query, setQuery] = useState("");
  const [role, setRoleFilter] = useState<RoleFilter | null>(null);
  const [presence, setPresence] = useState<PresenceFilter | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const filtered = !!(query.trim() || role || presence || teamFilter);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["teams", workspace.id] });
    void qc.invalidateQueries({ queryKey: ["workspace-members", workspace.id] });
  };

  // Tasks de cada pessoa: quantas fechou, de quantas, e a que está fazendo.
  const loads = useMemo(() => {
    const map = new Map<string, TaskLoad>();
    for (const t of tasksQ.data?.tasks ?? []) {
      if (!t.assignee_id) continue;
      const load = map.get(t.assignee_id) ?? { done: 0, total: 0, doing: null };
      load.total += 1;
      if (t.status === "done") load.done += 1;
      if (t.status === "doing" && !load.doing) load.doing = t.title;
      map.set(t.assignee_id, load);
    }
    return map;
  }, [tasksQ.data]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members
      .filter((m) => {
        const p = profiles?.get(m.user_id);
        if (role && m.role !== role) return false;
        if (presence && presenceOf(p) !== presence) return false;
        if (!term) return true;
        return (
          (p?.display_name ?? "").toLowerCase().includes(term) ||
          (p?.username ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const byRole = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
        if (byRole) return byRole;
        const an = profiles?.get(a.user_id)?.display_name ?? "";
        const bn = profiles?.get(b.user_id)?.display_name ?? "";
        return an.localeCompare(bn, "pt-BR");
      });
  }, [members, profiles, query, role, presence]);

  // Um grupo por equipe; quem não está em nenhuma fica em "Sem equipe". Sem
  // equipes criadas, o time inteiro é um grupo só.
  const groups = useMemo(() => {
    if (!teams.length) {
      return [
        { key: "all", team: null, title: "Todo mundo", color: NO_TEAM_COLOR, people: visible },
      ];
    }
    const list = teams
      .filter((t) => !teamFilter || teamFilter === t.id)
      .map((t) => ({
        key: t.id,
        team: t as Team | null,
        title: t.name,
        color: TEAM_COLOR_STYLE[t.color].dot,
        people: visible.filter((m) => t.member_ids.includes(m.user_id)),
      }));
    if (!teamFilter || teamFilter === "none") {
      const loose = visible.filter((m) => !teams.some((t) => t.member_ids.includes(m.user_id)));
      if (loose.length || teamFilter === "none") {
        list.push({
          key: "none",
          team: null,
          title: "Sem equipe",
          color: NO_TEAM_COLOR,
          people: loose,
        });
      }
    }
    // Com filtro ligado, grupo vazio só faz barulho.
    return filtered ? list.filter((g) => g.people.length) : list;
  }, [teams, visible, teamFilter, filtered]);

  const clearFilters = () => {
    setQuery("");
    setRoleFilter(null);
    setPresence(null);
    setTeamFilter(null);
  };

  const toggleTeam = async (team: Team, memberId: string) => {
    const inTeam = team.member_ids.includes(memberId);
    const { error } = inTeam
      ? await supabase.from("team_members").delete().eq("team_id", team.id).eq("user_id", memberId)
      : await supabase.from("team_members").insert({ team_id: team.id, user_id: memberId });
    if (error) {
      toast.error(errorMessage(error, "Não foi possível mudar a equipe."));
      return;
    }
    refresh();
  };

  const setRole = async (memberId: string, next: "admin" | "member") => {
    const { error } = await supabase.rpc("set_workspace_role", {
      _server_id: workspace.id,
      _user_id: memberId,
      _role: next,
    });
    if (error) {
      toast.error(errorMessage(error, "Não foi possível mudar o papel."));
      return;
    }
    toast.success(next === "admin" ? "Agora é admin." : "Agora é membro.");
    refresh();
  };

  const remove = async (memberId: string) => {
    const name = profiles?.get(memberId)?.display_name ?? "Essa pessoa";
    if (!window.confirm(`Tirar ${name} do workspace?`)) return;
    const { error } = await supabase.rpc("remove_from_workspace", {
      _server_id: workspace.id,
      _user_id: memberId,
    });
    if (error) {
      toast.error(errorMessage(error, "Não foi possível remover."));
      return;
    }
    toast.success(`${name} saiu do workspace.`);
    refresh();
  };

  const deleteTeam = async (team: Team) => {
    if (!window.confirm(`Apagar a equipe ${team.name}? As pessoas continuam no workspace.`)) return;
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) toast.error("Não foi possível apagar a equipe.");
    refresh();
  };

  const memberMenu = (m: WorkspaceMember) => {
    if (!canManage) return null;
    const manageable = m.role !== "owner" && m.user_id !== userId;
    if (!teams.length && !manageable) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-1 self-start rounded-xl text-muted-foreground"
            aria-label="Opções da pessoa"
          >
            <MoreHorizontal size={18} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {teams.length > 0 && (
            <>
              <DropdownMenuLabel>Equipes</DropdownMenuLabel>
              {teams.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.id}
                  checked={t.member_ids.includes(m.user_id)}
                  onCheckedChange={() => void toggleTeam(t, m.user_id)}
                >
                  {t.name}
                </DropdownMenuCheckboxItem>
              ))}
            </>
          )}
          {manageable && (
            <>
              {teams.length > 0 && <DropdownMenuSeparator />}
              {m.role === "admin" ? (
                <DropdownMenuItem onClick={() => void setRole(m.user_id, "member")}>
                  <ShieldCheck size={14} /> Tirar de admin
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void setRole(m.user_id, "admin")}>
                  <ShieldCheck size={14} /> Tornar admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={() => void remove(m.user_id)}>
                <UserMinus size={14} /> Remover do workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const teamOptions = [
    ...teams.map((t) => ({ value: t.id, label: t.name, dot: TEAM_COLOR_STYLE[t.color].dot })),
    { value: "none", label: "Sem equipe", dot: NO_TEAM_COLOR },
  ];

  return (
    <div className="space-y-9">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label="Papel"
            value={role}
            onChange={setRoleFilter}
            options={(["owner", "admin", "member"] as const).map((r) => ({
              value: r,
              label: ROLE_LABEL[r],
            }))}
          />
          <FilterChip
            label="Status"
            value={presence}
            onChange={setPresence}
            options={(Object.keys(PRESENCE_LABEL) as PresenceFilter[]).map((k) => ({
              value: k,
              label: PRESENCE_LABEL[k],
            }))}
          />
          {teams.length > 0 && (
            <FilterChip
              label="Equipe"
              value={teamFilter}
              onChange={setTeamFilter}
              options={teamOptions}
            />
          )}
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-10 rounded-full px-3 text-[13.5px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
            >
              Limpar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 lg:ml-auto">
          <div className="relative min-w-0 flex-1 lg:w-60 lg:flex-none">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              placeholder="Buscar pessoa"
              aria-label="Buscar pessoa"
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 rounded-full border-foreground/[0.08] bg-card pl-10 shadow-none"
            />
          </div>
          {canManage && (
            <>
              <Button
                variant="outline"
                className="h-10 shrink-0 rounded-full border-foreground/[0.08] bg-card px-4 shadow-none"
                onClick={onCreateTeam}
                aria-label="Nova equipe"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Nova equipe</span>
              </Button>
              <Button
                className="h-10 shrink-0 rounded-full px-4"
                onClick={() => onInvite()}
                aria-label="Convidar"
              >
                <UserPlus size={16} /> <span className="hidden sm:inline">Convidar</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="ws-card">
          <EmptyState
            pose="chuva"
            title="Ninguém com esses filtros"
            body="Tire um filtro ou busque por outro nome."
            action={
              <Button variant="outline" className="rounded-full" onClick={clearFilters}>
                Limpar filtros
              </Button>
            }
          />
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-labelledby={`team-group-${g.key}`} className="space-y-3.5">
            <div className="flex min-h-9 items-center gap-2.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
              <h2
                id={`team-group-${g.key}`}
                className="truncate text-[17px] font-semibold tracking-[-0.02em]"
              >
                {g.title}
              </h2>
              <span className="rounded-full bg-card px-2.5 py-0.5 text-[12.5px] font-medium tabular-nums text-muted-foreground shadow-[0_0_0_1px_rgb(var(--line)/0.06)]">
                {g.people.length}
              </span>
              {g.team?.description && (
                <p className="hidden min-w-0 truncate text-[13px] text-muted-foreground md:block">
                  {g.team.description}
                </p>
              )}
              {canManage && g.team && (
                <div className="ml-auto flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-muted-foreground"
                    onClick={() => onInvite(g.team?.id)}
                  >
                    <Plus size={14} /> <span className="hidden sm:inline">Adicionar</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full text-muted-foreground"
                        aria-label={`Opções da equipe ${g.title}`}
                      >
                        <MoreHorizontal size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onInvite(g.team?.id)}>
                        <UserPlus size={14} /> Chamar para a equipe
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => g.team && void deleteTeam(g.team)}
                      >
                        <X size={14} /> Apagar equipe
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {g.people.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {g.people.map((m) => (
                  <MemberCard
                    key={m.user_id}
                    member={m}
                    profile={profiles?.get(m.user_id)}
                    load={loads.get(m.user_id)}
                    color={g.color}
                    isSelf={m.user_id === userId}
                    onOpen={() => onOpenProfile(m.user_id)}
                    menu={memberMenu(m)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-[22px] border border-dashed border-foreground/[0.1] px-5 py-6 text-[13.5px] text-muted-foreground">
                Ninguém nesta equipe ainda.
                {canManage && g.team && (
                  <button
                    type="button"
                    onClick={() => onInvite(g.team?.id)}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Chamar alguém
                  </button>
                )}
              </div>
            )}
          </section>
        ))
      )}

      {!teams.length && canManage && (
        <div className="flex flex-col gap-3 rounded-[22px] border border-dashed border-foreground/[0.1] px-5 py-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Separe o time em equipes</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Produto, vendas, design: cada equipe vira um grupo nesta página.
            </p>
          </div>
          <Button variant="outline" className="rounded-full bg-card" onClick={onCreateTeam}>
            <Plus size={16} /> Criar equipe
          </Button>
        </div>
      )}

      <section aria-labelledby="team-invites" className="space-y-3.5">
        <div className="flex items-center gap-2.5">
          <h2 id="team-invites" className="text-[17px] font-semibold tracking-[-0.02em]">
            Convites pendentes
          </h2>
          <span className="rounded-full bg-card px-2.5 py-0.5 text-[12.5px] font-medium tabular-nums text-muted-foreground shadow-[0_0_0_1px_rgb(var(--line)/0.06)]">
            {invites.length}
          </span>
        </div>
        <PendingInvites
          invites={invites}
          teams={teams}
          profiles={profiles}
          canManage={canManage}
          onInvite={() => onInvite()}
        />
      </section>
    </div>
  );
}
