import { useMemo, useState } from "react";
import { inviteLink } from "@/lib/invite-link";
import { Check, Copy, Mail, AtSign } from "@/components/icons";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import type { Server } from "@/lib/clyro-types";
import { errorMessage, type Team } from "@/lib/workspace-queries";
import { UserAvatar } from "@/components/clyro/primitives";
import { Mascot } from "./mascot";

const NO_TEAM = "none";

/**
 * Convida por email ou por @usuário. Enquanto digita, sugere quem já tem conta
 * — amigos primeiro —, e dá para já mandar a pessoa direto para uma equipe.
 */
export function InviteDialog({
  open,
  onOpenChange,
  workspace,
  teams,
  memberIds,
  userId,
  defaultTeamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Server;
  teams: Team[];
  memberIds: string[];
  userId: string;
  defaultTeamId?: string | null;
}) {
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(userId);
  const [value, setValue] = useState("");
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? NO_TEAM);
  const [role, setRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const friendIds = useMemo(
    () =>
      new Set(
        friendships
          .filter((f) => f.status === "accepted")
          .map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id)),
      ),
    [friendships, userId],
  );

  const term = value.trim().replace(/^@/, "").toLowerCase();
  const isEmail = value.includes("@") && !value.trim().startsWith("@");

  const suggestions = useMemo(() => {
    if (!profiles || isEmail) return [];
    const members = new Set(memberIds);
    return [...profiles.values()]
      .filter((p) => !members.has(p.id) && p.id !== userId)
      .filter(
        (p) =>
          !term ||
          p.username.toLowerCase().includes(term) ||
          (p.display_name ?? "").toLowerCase().includes(term),
      )
      .filter((p) => term || friendIds.has(p.id))
      .sort((a, b) => Number(friendIds.has(b.id)) - Number(friendIds.has(a.id)))
      .slice(0, 5);
  }, [profiles, isEmail, memberIds, userId, term, friendIds]);

  const invite = async (identifier: string) => {
    const target = identifier.trim();
    if (!target) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("invite_to_workspace", {
      _server_id: workspace.id,
      _identifier: target,
      _team_id: teamId === NO_TEAM ? undefined : teamId,
      _role: role,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error, "Não foi possível enviar o convite."));
      return;
    }
    if (!data?.id) {
      toast.success(
        teamId === NO_TEAM
          ? "Essa pessoa já está no workspace."
          : "Essa pessoa já estava no workspace — agora está na equipe também.",
      );
    } else if (data.user_id) {
      toast.success("Convite enviado. A pessoa vê no Clyro e aceita com um clique.");
    } else {
      toast.success(
        "Convite guardado para esse email. Assim que a pessoa criar a conta, ele aparece para ela.",
      );
    }
    setValue("");
    void qc.invalidateQueries({ queryKey: ["workspace-invites", workspace.id] });
    void qc.invalidateQueries({ queryKey: ["teams", workspace.id] });
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(inviteLink(workspace.invite_code));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-[28px] p-0">
        <div className="flex items-center gap-4 bg-secondary px-7 pb-5 pt-7">
          <Mascot pose="energia" size={72} />
          <div className="min-w-0">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Chamar para {workspace.name}
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm">
              Por email ou @usuário. Quem ainda não tem conta recebe o convite ao entrar com aquele
              email.
            </DialogDescription>
          </div>
        </div>

        <div className="space-y-5 px-7 py-6">
          <div className="space-y-2">
            <Label htmlFor="invite-target">Email ou usuário</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {isEmail ? <Mail size={16} /> : <AtSign size={16} />}
                </span>
                <Input
                  id="invite-target"
                  autoFocus
                  value={value}
                  placeholder="nome@empresa.com ou @usuario"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void invite(value)}
                  className="h-11 rounded-xl pl-10"
                />
              </div>
              <Button
                className="h-11 rounded-xl px-5"
                disabled={busy || !value.trim()}
                onClick={() => void invite(value)}
              >
                Convidar
              </Button>
            </div>

            {suggestions.length > 0 && (
              <ul className="space-y-1 rounded-2xl border border-border p-1.5">
                {suggestions.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                    <UserAvatar profile={p} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.display_name || p.username}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{p.username}
                        {friendIds.has(p.id) && " · amigo"}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-xl"
                      disabled={busy}
                      onClick={() => void invite(p.username)}
                    >
                      Convidar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-team">Equipe</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="invite-team" className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEAM}>Sem equipe por enquanto</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "member" | "admin")}>
                <SelectTrigger id="invite-role" className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membro</SelectItem>
                  <SelectItem value="admin">Admin — convida e organiza equipes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-7 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              Ou mande o link: quem abrir entra direto
            </p>
            <p className="truncate font-mono text-sm font-semibold">
              {inviteLink(workspace.invite_code)}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => void copyCode()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
