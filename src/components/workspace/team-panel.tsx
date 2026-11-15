import { useMemo, useState } from "react";
import {
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
export function activityLine(profile: Profile | undefined) {
  if (!profile) return "";
  if (profile.activity) return profile.activity;
  return STATUS_LABEL[profile.status] ?? "Offline";
}

/**
 * Cartão de membro do painel: foto grande, nome, papel, o que está fazendo e
 * as equipes. O mesmo cartão serve a visão "Agora" e a página da equipe.
 */
export function MemberCard({
  member,
  profile,
  teams,
  isSelf,
  onOpen,
  menu,
}: {
  member: WorkspaceMember;
  profile: Profile | undefined;
  teams: Team[];
  isSelf: boolean;
  onOpen?: () => void;
  menu?: React.ReactNode;
}) {
  const status = profile?.status;
  const busy = !!profile?.activity;
  return (
    <div className="ws-card group relative flex flex-col gap-4 p-5 clyro-lift">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="shrink-0" aria-label="Ver perfil">
          <UserAvatar profile={profile} size={52} />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block max-w-full truncate text-left text-[15px] font-semibold hover:underline"
          >
            {profile?.display_name || profile?.username || "Alguém"}
            {isSelf && <span className="font-normal text-muted-foreground"> (você)</span>}
          </button>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {member.role === "owner" && <Crown size={12} />}
            {member.role === "admin" && <ShieldCheck size={12} />}
            {ROLE_LABEL[member.role]} · @{profile?.username}
          </p>
        </div>
        {menu}
      </div>

      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm",
          busy ? "bg-brand-soft text-brand-strong" : "bg-secondary text-muted-foreground",
        )}
      >
        <StatusDot status={status} className="h-2.5 w-2.5 ring-0" />
        <span className="truncate">{activityLine(profile)}</span>
      </div>

      {teams.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {teams.map((t) => (
            <TeamChip key={t.id} team={t} />
          ))}
        </div>
      )}
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

/**
 * Página "Equipe": todo mundo do workspace, com busca, filtro por equipe e —
 * para quem administra — trocar papel, mover entre equipes e remover.
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["teams", workspace.id] });
    void qc.invalidateQueries({ queryKey: ["workspace-members", workspace.id] });
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return members.filter((m) => {
      const p = profiles?.get(m.user_id);
      if (filter && !teams.find((t) => t.id === filter)?.member_ids.includes(m.user_id)) {
        return false;
      }
      if (!term) return true;
      return (
        (p?.display_name ?? "").toLowerCase().includes(term) ||
        (p?.username ?? "").toLowerCase().includes(term)
      );
    });
  }, [members, profiles, query, filter, teams]);

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

  const setRole = async (memberId: string, role: "admin" | "member") => {
    const { error } = await supabase.rpc("set_workspace_role", {
      _server_id: workspace.id,
      _user_id: memberId,
      _role: role,
    });
    if (error) {
      toast.error(errorMessage(error, "Não foi possível mudar o papel."));
      return;
    }
    toast.success(role === "admin" ? "Agora é admin." : "Agora é membro.");
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

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold tracking-tight">Equipes</h2>
          {canManage && (
            <Button variant="outline" className="rounded-2xl" onClick={onCreateTeam}>
              <Plus size={16} /> Nova equipe
            </Button>
          )}
        </div>
        {teams.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                profiles={profiles}
                canManage={canManage}
                onInvite={() => onInvite(team.id)}
                onDelete={async () => {
                  if (
                    !window.confirm(
                      `Apagar a equipe ${team.name}? As pessoas continuam no workspace.`,
                    )
                  )
                    return;
                  const { error } = await supabase.from("teams").delete().eq("id", team.id);
                  if (error) toast.error("Não foi possível apagar a equipe.");
                  refresh();
                }}
              />
            ))}
          </div>
        ) : (
          <div className="ws-card">
            <EmptyState
              pose="estrela"
              title="Nenhuma equipe ainda"
              body="Separe o time em equipes para ver quem cuida do quê."
              action={
                canManage && (
                  <Button className="rounded-2xl" onClick={onCreateTeam}>
                    <Plus size={16} /> Criar equipe
                  </Button>
                )
              }
            />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-lg font-semibold tracking-tight">
            Pessoas <span className="text-muted-foreground">· {members.length}</span>
          </h2>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              placeholder="Buscar pessoa"
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-52 rounded-2xl bg-card pl-10"
            />
          </div>
          {canManage && (
            <Button className="rounded-2xl" onClick={() => onInvite()}>
              <UserPlus size={16} /> Convidar
            </Button>
          )}
        </div>

        {teams.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                !filter
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent",
              )}
            >
              Todo mundo
            </button>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(filter === t.id ? null : t.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  filter === t.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:bg-accent",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => {
            const memberTeams = teams.filter((t) => t.member_ids.includes(m.user_id));
            const manageable = canManage && m.role !== "owner" && m.user_id !== userId;
            return (
              <MemberCard
                key={m.user_id}
                member={m}
                profile={profiles?.get(m.user_id)}
                teams={memberTeams}
                isSelf={m.user_id === userId}
                onOpen={() => onOpenProfile(m.user_id)}
                menu={
                  canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 rounded-xl">
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
                            <DropdownMenuSeparator />
                            {m.role === "admin" ? (
                              <DropdownMenuItem onClick={() => void setRole(m.user_id, "member")}>
                                <ShieldCheck size={14} /> Tirar de admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => void setRole(m.user_id, "admin")}>
                                <ShieldCheck size={14} /> Tornar admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => void remove(m.user_id)}
                            >
                              <UserMinus size={14} /> Remover do workspace
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                }
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Convites pendentes <span className="text-muted-foreground">· {invites.length}</span>
        </h2>
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
