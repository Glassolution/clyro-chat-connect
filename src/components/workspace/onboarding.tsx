import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, X } from "@/components/icons";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/lib/clyro-types";
import { errorMessage, type IncomingInvite } from "@/lib/workspace-queries";
import { MediaImage } from "@/components/clyro/primitives";
import { Mascot, type MascotPose } from "./mascot";

/** Convites endereçados a você, no topo do painel, com aceitar e recusar. */
export function IncomingInvites({
  invites,
  userId,
  onJoined,
}: {
  invites: IncomingInvite[];
  userId: string;
  onJoined: (workspaceId: string) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const respond = async (invite: IncomingInvite, accept: boolean) => {
    setBusy(invite.id);
    const { data, error } = await supabase.rpc("respond_to_invite", {
      _invite_id: invite.id,
      _accept: accept,
    });
    setBusy(null);
    if (error) {
      toast.error(errorMessage(error, "Não foi possível responder ao convite."));
      return;
    }
    void qc.invalidateQueries({ queryKey: ["incoming-invites", userId] });
    if (accept) {
      await qc.invalidateQueries({ queryKey: ["servers", userId] });
      toast.success(`Você entrou em ${invite.workspace_name}.`);
      if (data) onJoined(data);
    }
  };

  return (
    <div className="space-y-2 px-5 pb-4 sm:px-8">
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex items-center gap-4 rounded-[24px] border border-border bg-card p-3 pr-4 shadow-card clyro-enter"
        >
          <Mascot pose="sorte" size={52} className="shrink-0" />
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-sm font-semibold">
            {invite.workspace_icon ? (
              <MediaImage src={invite.workspace_icon} className="h-full w-full object-cover" />
            ) : (
              initialsOf(invite.workspace_name)
            )}
          </span>
          <p className="min-w-0 flex-1 text-sm">
            Você foi chamado para <strong>{invite.workspace_name}</strong>
            {invite.role === "admin" && " como admin"}.
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            aria-label="Recusar"
            disabled={busy === invite.id}
            onClick={() => void respond(invite, false)}
          >
            <X size={18} />
          </Button>
          <Button
            className="rounded-xl"
            disabled={busy === invite.id}
            onClick={() => void respond(invite, true)}
          >
            <Check size={16} /> Entrar
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Primeira vez no Clyro novo: ainda sem nenhum workspace. */
export function WelcomeScreen({ name, onCreate }: { name: string; onCreate: () => void }) {
  const poses: MascotPose[] = ["energia", "neutro", "estrela"];
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
      <div className="flex items-end gap-2">
        {poses.map((pose, i) => (
          <Mascot
            key={pose}
            pose={pose}
            size={i === 1 ? 120 : 92}
            float
            className={i === 1 ? "" : "opacity-90"}
          />
        ))}
      </div>
      <h2 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">Bem-vindo, {name}.</h2>
      <p className="mt-3 max-w-md text-[15px] text-muted-foreground">
        Você ainda não está em nenhuma comunidade. Encontre um projeto que procura gente como você,
        ou publique o seu e monte o time.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="flex h-14 items-center rounded-full bg-brand px-8 text-base text-white shadow-violet"
        >
          Descobrir projetos
        </Link>
        <Button variant="outline" className="h-14 rounded-full px-8 text-base" onClick={onCreate}>
          Publicar meu projeto
        </Button>
      </div>
    </div>
  );
}

/** Seções que chegam nas próximas fases. */
export function ComingSoon({
  pose,
  title,
  body,
  bullets,
}: {
  pose: MascotPose;
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto px-5 pb-8 sm:px-8">
      <div className="ws-card flex w-full max-w-2xl flex-col items-center gap-4 px-8 py-12 text-center">
        <Mascot pose={pose} size={128} float />
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand-strong">
          Em construção
        </span>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        <p className="max-w-md text-[15px] text-muted-foreground">{body}</p>
        <ul className="mt-2 grid w-full max-w-md gap-2 text-left">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3 text-sm"
            >
              <Check size={16} className="shrink-0 text-brand" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
