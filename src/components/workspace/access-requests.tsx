import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/clyro-types";
import { type AccessQuestion, type AccessRequest } from "@/lib/project-queries";
import { errorMessage } from "@/lib/workspace-queries";
import { UserAvatar } from "@/components/clyro/primitives";
import { EmptyState } from "./mascot";

/**
 * Pedidos de entrada: o perfil de quem pediu, as respostas ao formulário e o
 * recado. Aprovar coloca a pessoa no time na hora.
 */
export function AccessRequests({
  serverId,
  requests,
  questions,
}: {
  serverId: string;
  requests: AccessRequest[];
  questions: AccessQuestion[];
}) {
  const ids = requests.map((r) => r.user_id);
  const { data: people } = useQuery({
    enabled: ids.length > 0,
    queryKey: ["request-profiles", ids.join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      return new Map((data ?? []).map((p) => [p.id, p as Profile]));
    },
  });

  if (!requests.length) {
    return (
      <div className="ws-card">
        <EmptyState
          pose="sorte"
          title="Nenhum pedido agora"
          body="Quando alguém pedir para entrar pela página do projeto, o perfil e as respostas aparecem aqui."
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {requests.map((r) => (
        <RequestCard
          key={r.id}
          serverId={serverId}
          request={r}
          profile={people?.get(r.user_id)}
          questions={questions}
        />
      ))}
    </div>
  );
}

function RequestCard({
  serverId,
  request,
  profile,
  questions,
}: {
  serverId: string;
  request: AccessRequest;
  profile: Profile | undefined;
  questions: AccessQuestion[];
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  // Perguntas que o founder apagou depois continuam aparecendo pelo id.
  const labels = new Map(questions.map((q) => [q.id, q.label]));
  const answered = Object.entries(request.answers).filter(([, v]) => v.trim());

  const review = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject");
    const { error } = await supabase.rpc("review_access_request", {
      _request_id: request.id,
      _approve: approve,
    });
    setBusy(null);
    if (error) {
      toast.error(errorMessage(error, "Não deu para responder o pedido."));
      return;
    }
    toast.success(
      approve ? `${profile?.display_name ?? "A pessoa"} entrou no time.` : "Pedido recusado.",
    );
    void qc.invalidateQueries({ queryKey: ["project-requests", serverId] });
    void qc.invalidateQueries({ queryKey: ["server-members", serverId] });
    void qc.invalidateQueries({ queryKey: ["workspace-members", serverId] });
  };

  return (
    <article className="ws-card flex flex-col p-6">
      <div className="flex items-center gap-3">
        <UserAvatar profile={profile} size={48} showStatus={false} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{profile?.display_name ?? "…"}</p>
          <p className="truncate text-sm text-muted-foreground">
            {profile ? `@${profile.username}` : ""} ·{" "}
            {new Date(request.created_at).toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "short",
            })}
          </p>
        </div>
      </div>
      {profile?.bio && <p className="mt-3 text-sm text-foreground/80">{profile.bio}</p>}

      <div className="mt-4 space-y-3">
        {answered.map(([id, value]) => (
          <div key={id} className="rounded-2xl bg-secondary px-4 py-3">
            <p className="text-xs text-muted-foreground">{labels.get(id) ?? "Resposta"}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{value}</p>
          </div>
        ))}
        {request.message && (
          <div className="rounded-2xl border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">Recado</p>
            <p className="mt-1 whitespace-pre-line text-sm">{request.message}</p>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void review(false)}
          className="h-11 rounded-full border border-border text-sm hover:bg-secondary disabled:opacity-60"
        >
          {busy === "reject" ? "Recusando…" : "Recusar"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void review(true)}
          className="h-11 rounded-full bg-primary text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy === "approve" ? "Aprovando…" : "Aprovar"}
        </button>
      </div>
    </article>
  );
}
