import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Global, Lock1, People, TickCircle } from "iconsax-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { categoryOf, useProject, type ProjectDetail } from "@/lib/project-queries";
import { errorMessage } from "@/lib/workspace-queries";
import { UserAvatar, MediaImage } from "@/components/clyro/primitives";
import { Mascot } from "@/components/workspace/mascot";
import { SiteRail } from "@/components/discover/site-rail";
import { ProjectArt } from "@/components/discover/project-tile";
import { ProjectDialog } from "@/components/discover/project-dialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/p/$projectId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Projeto no Clyro" },
      { name: "description", content: "Veja o projeto e peça para entrar no time." },
    ],
  }),
  component: ProjectPage,
});

const WORKSPACE_KEY = "clyro:workspace";

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(projectId);
  const [requestOpen, setRequestOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const openCommunity = () => {
    try {
      window.localStorage.setItem(WORKSPACE_KEY, projectId);
    } catch {
      /* sem storage, o app abre no último workspace */
    }
    void navigate({ to: "/app" });
  };

  const publish = () => {
    if (!user) void navigate({ to: "/auth", search: { next: `/p/${projectId}` } });
    else setEditOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <SiteRail active="discover" profile={profile} onPublish={publish} />
      <div className="min-w-0 flex-1 py-2 pr-2 sm:py-3 sm:pr-3">
        <div className="min-h-full rounded-[28px] bg-card px-4 pb-20 pt-6 sm:px-10">
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm shadow-pill hover:bg-secondary"
          >
            <ArrowLeft size={18} color="currentColor" /> Descobrir
          </Link>

          {isLoading ? (
            <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
              <div className="aspect-[16/9] animate-pulse rounded-[28px] bg-secondary" />
              <div className="h-72 animate-pulse rounded-[28px] bg-secondary" />
            </div>
          ) : !project ? (
            <div className="mx-auto mt-16 flex max-w-sm flex-col items-center text-center">
              <Mascot pose="chuva" size={130} float />
              <p className="mt-3 text-xl font-semibold tracking-[-0.04em]">
                Projeto não encontrado
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                O link pode estar errado, ou o projeto saiu do ar.
              </p>
            </div>
          ) : (
            <ProjectBody
              project={project}
              isOwner={user?.id === project.owner_id}
              signedIn={!!user}
              onRequest={() =>
                user
                  ? setRequestOpen(true)
                  : void navigate({ to: "/auth", search: { next: `/p/${projectId}` } })
              }
              onOpen={openCommunity}
              onEdit={() => setEditOpen(true)}
            />
          )}
        </div>
      </div>

      {project && user && (
        <RequestDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          project={project}
          profile={profile}
        />
      )}
      {user && (
        <ProjectDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          userId={user.id}
          {...(project && user.id === project.owner_id ? { project } : {})}
          onSaved={(id) => void navigate({ to: "/p/$projectId", params: { projectId: id } })}
        />
      )}
    </div>
  );
}

function ProjectBody({
  project,
  isOwner,
  signedIn,
  onRequest,
  onOpen,
  onEdit,
}: {
  project: ProjectDetail;
  isOwner: boolean;
  signedIn: boolean;
  onRequest: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const cat = categoryOf(project.category);
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="aspect-[16/9] overflow-hidden rounded-[28px]">
          <ProjectArt project={project} mascotSize={180} />
        </div>

        <div className="mt-7 flex items-start gap-4">
          {project.icon_url && (
            <MediaImage
              src={project.icon_url}
              className="h-14 w-14 shrink-0 rounded-2xl object-cover"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-[clamp(2rem,4vw,2.75rem)] font-semibold leading-tight tracking-[-0.05em]">
              {project.name}
            </h1>
            {project.tagline && (
              <p className="mt-1 text-lg text-muted-foreground">{project.tagline}</p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {cat && (
            <span
              className="rounded-full px-3 py-1.5 text-sm font-medium"
              style={{ background: cat.tone, color: cat.ink }}
            >
              {cat.label}
            </span>
          )}
          {project.stage && (
            <span className="rounded-full bg-secondary px-3 py-1.5 text-sm">{project.stage}</span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm">
            {project.is_public ? (
              <Global size={15} color="currentColor" />
            ) : (
              <Lock1 size={15} color="currentColor" />
            )}
            {project.is_public ? "Público" : "Privado"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm">
            <People size={15} color="currentColor" />
            {project.member_count} {project.member_count === 1 ? "pessoa" : "pessoas"}
          </span>
        </div>

        {project.looking_for.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold tracking-[-0.04em]">Procurando</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {project.looking_for.map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-border px-4 py-2 text-[15px] shadow-pill"
                >
                  {r}
                </span>
              ))}
            </div>
          </section>
        )}

        {project.description && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold tracking-[-0.04em]">Sobre o projeto</h2>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-foreground/80">
              {project.description}
            </p>
          </section>
        )}

        {project.website && (
          <a
            href={
              project.website.startsWith("http") ? project.website : `https://${project.website}`
            }
            target="_blank"
            rel="noreferrer noopener"
            className="mt-8 inline-flex items-center gap-2 text-sm text-brand underline-offset-4 hover:underline"
          >
            <Global size={16} color="currentColor" /> {project.website}
          </a>
        )}
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="ws-card p-6">
          <div className="flex items-center gap-3">
            <UserAvatar
              profile={
                project.owner_name
                  ? ({
                      id: project.owner_id,
                      username: project.owner_name,
                      display_name: project.owner_name,
                      avatar_url: project.owner_avatar,
                      status: "online",
                      activity: null,
                      created_at: project.created_at,
                    } as never)
                  : undefined
              }
              size={40}
              showStatus={false}
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Founder</p>
              <p className="truncate font-semibold">{project.owner_name ?? "—"}</p>
            </div>
          </div>

          <div className="my-5 h-px bg-border" />

          <Action
            project={project}
            isOwner={isOwner}
            signedIn={signedIn}
            onRequest={onRequest}
            onOpen={onOpen}
            onEdit={onEdit}
          />
        </div>

        {project.access_questions.length > 0 && !project.is_member && !isOwner && (
          <div className="mt-3 rounded-[28px] bg-secondary p-6">
            <p className="text-sm font-semibold">O que o founder vai perguntar</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {project.access_questions.map((q) => (
                <li key={q.id}>
                  • {q.label}
                  {q.required && <span className="text-foreground"> *</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function Action({
  project,
  isOwner,
  signedIn,
  onRequest,
  onOpen,
  onEdit,
}: {
  project: ProjectDetail;
  isOwner: boolean;
  signedIn: boolean;
  onRequest: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (project.is_member || isOwner) {
    return (
      <div className="space-y-2">
        <p className="mb-3 flex items-center gap-2 text-sm">
          <TickCircle size={18} color="#1d8a4e" variant="Bold" />
          {isOwner ? "Este projeto é seu." : "Você faz parte do time."}
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="h-12 w-full rounded-full bg-primary text-[15px] text-primary-foreground"
        >
          Abrir comunidade
        </button>
        {isOwner && (
          <button
            type="button"
            onClick={onEdit}
            className="h-12 w-full rounded-full border border-border text-[15px] hover:bg-secondary"
          >
            Editar projeto
          </button>
        )}
      </div>
    );
  }

  if (project.request_status === "pending") {
    const cancel = async () => {
      setBusy(true);
      const { data } = await supabase
        .from("access_requests")
        .select("id")
        .eq("server_id", project.id)
        .eq("status", "pending")
        .maybeSingle();
      const { error } = data
        ? await supabase.rpc("cancel_access_request", { _request_id: data.id })
        : { error: null };
      setBusy(false);
      if (error) {
        toast.error(errorMessage(error, "Não deu para cancelar o pedido."));
        return;
      }
      toast("Pedido cancelado.");
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["discover-projects"] });
    };
    return (
      <div className="flex flex-col items-center text-center">
        <Mascot pose="energia" size={96} float />
        <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">Pedido enviado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          O founder vai ver o seu perfil e as respostas. Quando aprovar, o projeto aparece em Minhas
          comunidades.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void cancel()}
          className="mt-4 h-11 w-full rounded-full border border-border text-sm hover:bg-secondary disabled:opacity-60"
        >
          Cancelar pedido
        </button>
      </div>
    );
  }

  return (
    <div>
      {project.request_status === "rejected" && (
        <p className="mb-3 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
          O último pedido não foi aprovado. Você pode tentar de novo.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {project.is_public
          ? "Responda o formulário do founder. Se ele aprovar, você entra direto no dashboard do time."
          : "Projeto privado: só entra quem o founder aprovar."}
      </p>
      <button
        type="button"
        onClick={onRequest}
        className="mt-4 h-12 w-full rounded-full bg-brand text-[15px] text-white shadow-violet transition-transform hover:scale-[1.02]"
      >
        {signedIn ? "Pedir para entrar" : "Entrar para pedir acesso"}
      </button>
    </div>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  project,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  profile: ReturnType<typeof useAuth>["profile"];
}) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const missing = project.access_questions.filter(
    (q) => q.required && !(answers[q.id] ?? "").trim(),
  );

  const submit = async () => {
    if (missing.length) {
      toast.error("Responda as perguntas obrigatórias.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("request_access", {
      _server_id: project.id,
      _answers: answers,
      _message: message.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error, "Não deu para enviar o pedido."));
      return;
    }
    toast.success("Pedido enviado ao founder.");
    onOpenChange(false);
    void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    void queryClient.invalidateQueries({ queryKey: ["discover-projects"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[28px] border-0 p-0 sm:max-w-lg">
        <div className="p-6 sm:p-8">
          <DialogTitle className="text-2xl font-semibold tracking-[-0.04em]">
            Pedir para entrar
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            {project.name} vai ver o seu perfil e estas respostas.
          </DialogDescription>

          {profile && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-secondary p-3">
              <UserAvatar profile={profile} size={44} showStatus={false} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{profile.display_name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  @{profile.username}
                  {profile.bio ? ` · ${profile.bio}` : ""}
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-5">
            {project.access_questions.map((q) => (
              <label key={q.id} className="block">
                <span className="text-sm font-medium">
                  {q.label}
                  {q.required && <span className="text-brand"> *</span>}
                </span>
                <textarea
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  rows={3}
                  maxLength={1000}
                  className="mt-2 w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] outline-none focus:border-brand"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-sm font-medium">Recado para o founder (opcional)</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Links, portfólio, quando você pode começar…"
                className="mt-2 w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground focus:border-brand"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="mt-7 h-12 w-full rounded-full bg-primary text-[15px] text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
