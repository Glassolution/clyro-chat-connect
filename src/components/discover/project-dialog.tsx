import { useEffect, useRef, useState } from "react";
import { Add, Camera, CloseCircle, Global, Lock } from "iconsax-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { uploadProfileImage } from "@/lib/profile-media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  CATEGORIES,
  ROLES,
  STAGES,
  type AccessQuestion,
  type ProjectDetail,
} from "@/lib/project-queries";
import { errorMessage } from "@/lib/workspace-queries";
import { ProjectArt } from "./project-tile";

const DEFAULT_QUESTIONS: AccessQuestion[] = [
  { id: "q1", label: "O que você faz e no que pode ajudar?", required: true },
  { id: "q2", label: "Link do seu LinkedIn, GitHub ou portfólio", required: false },
];

/** Salas e equipes com que todo projeto nasce. */
const STARTER_ROOMS = [
  { name: "geral", kind: "text" as const },
  { name: "anuncios", kind: "text" as const },
  { name: "Daily", kind: "voice" as const },
  { name: "Reunião geral", kind: "voice" as const },
];
const STARTER_TEAMS = [
  { name: "Produto", color: "violet" },
  { name: "Engenharia", color: "blue" },
  { name: "Growth", color: "orange" },
];

/**
 * Publicar (ou editar) um projeto: o que é, o que procura, quem vê e o que
 * perguntar a quem pede para entrar.
 */
export function ProjectDialog({
  open,
  onOpenChange,
  userId,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** Com projeto, edita; sem, publica um novo. */
  project?: ProjectDetail | null;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const editing = !!project;
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("saas");
  const [stage, setStage] = useState<string>("MVP");
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [website, setWebsite] = useState("");
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AccessQuestion[]>(DEFAULT_QUESTIONS);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setTagline(project?.tagline ?? "");
    setDescription(project?.description ?? "");
    setCategory(project?.category ?? "saas");
    setStage(project?.stage ?? "MVP");
    setLookingFor(project?.looking_for ?? []);
    setIsPublic(project?.is_public ?? true);
    setWebsite(project?.website ?? "");
    setCoverUrl(project?.cover_url ?? null);
    setQuestions(project ? project.access_questions : DEFAULT_QUESTIONS);
  }, [open, project]);

  const toggleRole = (role: string) =>
    setLookingFor((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const uploadCover = async (file: File) => {
    setUploading(true);
    const result = await uploadProfileImage(userId, file, "project-cover");
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCoverUrl(result.url);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const cleanQuestions = questions
      .map((q) => ({ ...q, label: q.label.trim() }))
      .filter((q) => q.label.length > 0);
    const fields = {
      name: trimmed,
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      category,
      stage,
      looking_for: lookingFor,
      is_public: isPublic,
      website: website.trim() || null,
      cover_url: coverUrl,
      access_questions: cleanQuestions,
    };

    setBusy(true);
    if (editing && project) {
      const { error } = await supabase.from("servers").update(fields).eq("id", project.id);
      setBusy(false);
      if (error) {
        toast.error(errorMessage(error, "Não foi possível salvar o projeto."));
        return;
      }
      toast.success("Projeto atualizado.");
      void qc.invalidateQueries({ queryKey: ["project", project.id] });
      void qc.invalidateQueries({ queryKey: ["discover-projects"] });
      void qc.invalidateQueries({ queryKey: ["servers", userId] });
      onOpenChange(false);
      onSaved(project.id);
      return;
    }

    const { data, error } = await supabase
      .from("servers")
      .insert({ ...fields, owner_id: userId })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error(errorMessage(error, "Não foi possível publicar o projeto."));
      return;
    }
    await supabase
      .from("server_members")
      .insert({ server_id: data.id, user_id: userId, role: "owner" });
    await supabase
      .from("channels")
      .insert(STARTER_ROOMS.map((room, position) => ({ server_id: data.id, ...room, position })));
    await supabase
      .from("teams")
      .insert(STARTER_TEAMS.map((t) => ({ server_id: data.id, created_by: userId, ...t })));
    setBusy(false);
    toast.success(
      isPublic ? "Projeto publicado na vitrine." : "Projeto criado. Compartilhe o link.",
    );
    void qc.invalidateQueries({ queryKey: ["discover-projects"] });
    void qc.invalidateQueries({ queryKey: ["servers", userId] });
    onOpenChange(false);
    onSaved(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-[28px] p-0">
        <div className="px-7 pb-4 pt-7">
          <DialogTitle className="text-2xl font-semibold tracking-[-0.04em]">
            {editing ? "Editar projeto" : "Publicar projeto"}
          </DialogTitle>
          <DialogDescription className="mt-1">
            Conte o que você está construindo e quem você procura. Quem quiser entrar responde o seu
            formulário, e você decide.
          </DialogDescription>
        </div>

        <div className="clyro-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-7 pb-6">
          {/* Capa */}
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            className="group relative block aspect-[16/7] w-full overflow-hidden rounded-[22px] bg-secondary"
          >
            <ProjectArt project={{ cover_url: coverUrl, category, name }} mascotSize={110} />
            <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium shadow-pill">
              <Camera size={16} color="currentColor" />
              {uploading ? "Enviando…" : coverUrl ? "Trocar capa" : "Adicionar capa"}
            </span>
          </button>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadCover(file);
              e.target.value = "";
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="p-name">
              <Input
                id="p-name"
                value={name}
                maxLength={60}
                placeholder="Ex.: Acme Labs"
                onChange={(e) => setName(e.target.value)}
                className="h-12 rounded-full px-5"
              />
            </Field>
            <Field label="Em uma frase" htmlFor="p-tagline">
              <Input
                id="p-tagline"
                value={tagline}
                maxLength={90}
                placeholder="CRM com IA para pequenas lojas"
                onChange={(e) => setTagline(e.target.value)}
                className="h-12 rounded-full px-5"
              />
            </Field>
          </div>

          <Field label="Sobre o projeto" htmlFor="p-desc">
            <Textarea
              id="p-desc"
              rows={4}
              value={description}
              maxLength={1200}
              placeholder="O problema, a solução, onde vocês estão e para onde vão."
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none rounded-[20px] px-5 py-3"
            />
          </Field>

          <Field label="Categoria">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                  <span className="h-3 w-3 rounded-full" style={{ background: c.ink }} />
                  {c.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Estágio">
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <Chip key={s} active={stage === s} onClick={() => setStage(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Procurando">
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <Chip key={r} active={lookingFor.includes(r)} onClick={() => toggleRole(r)}>
                  {r}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Quem vê">
            <div className="grid gap-2 sm:grid-cols-2">
              <VisibilityOption
                active={isPublic}
                onClick={() => setIsPublic(true)}
                icon={<Global size={20} color="currentColor" />}
                title="Público"
                body="Aparece na vitrine e na busca."
              />
              <VisibilityOption
                active={!isPublic}
                onClick={() => setIsPublic(false)}
                icon={<Lock size={20} color="currentColor" />}
                title="Privado"
                body="Só quem tiver o link encontra."
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Nos dois casos, quem quiser entrar pede acesso e você aprova.
            </p>
          </Field>

          <Field label="Site (opcional)" htmlFor="p-site">
            <Input
              id="p-site"
              value={website}
              placeholder="https://"
              onChange={(e) => setWebsite(e.target.value)}
              className="h-12 rounded-full px-5"
            />
          </Field>

          <Field label="Formulário de entrada">
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2">
                  <Input
                    value={q.label}
                    placeholder="Pergunta"
                    onChange={(e) =>
                      setQuestions((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    className="h-11 flex-1 rounded-full px-5"
                  />
                  <Chip
                    active={q.required}
                    onClick={() =>
                      setQuestions((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, required: !x.required } : x)),
                      )
                    }
                  >
                    Obrigatória
                  </Chip>
                  <button
                    type="button"
                    aria-label="Remover pergunta"
                    onClick={() => setQuestions((prev) => prev.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <CloseCircle size={22} color="currentColor" />
                  </button>
                </div>
              ))}
              {questions.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    setQuestions((prev) => [
                      ...prev,
                      { id: `q${Date.now().toString(36)}`, label: "", required: false },
                    ])
                  }
                  className="flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <Add size={18} color="currentColor" /> Adicionar pergunta
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-7 py-4">
          <Button
            variant="ghost"
            className="h-12 rounded-full px-5"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            className="h-12 rounded-full px-6"
            disabled={busy || uploading || !name.trim()}
            onClick={() => void save()}
          >
            {editing ? "Salvar" : "Publicar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function Chip({
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
        "flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card shadow-pill hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

function VisibilityOption({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-[20px] border p-4 text-left transition-colors",
        active ? "border-primary bg-secondary" : "border-border hover:bg-secondary",
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}
