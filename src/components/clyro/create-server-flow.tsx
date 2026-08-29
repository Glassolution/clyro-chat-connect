import { useRef, useState } from "react";
import { ArrowLeft, Camera, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * Cada modelo define os canais que o servidor nasce tendo. É o que faz a
 * primeira etapa valer alguma coisa — sem isso ela seria só decoração.
 */
type Template = {
  id: string;
  emoji: string;
  label: string;
  channels: { name: string; kind: "text" | "voice" }[];
};

const OWN_TEMPLATE: Template = {
  id: "own",
  emoji: "✨",
  label: "Criar minha própria",
  channels: [
    { name: "geral", kind: "text" },
    { name: "avisos", kind: "text" },
    { name: "Sala de voz", kind: "voice" },
  ],
};

const TEMPLATES: Template[] = [
  {
    id: "games",
    emoji: "🎮",
    label: "Jogos",
    channels: [
      { name: "geral", kind: "text" },
      { name: "procura-se-time", kind: "text" },
      { name: "clipes", kind: "text" },
      { name: "Sala de jogo", kind: "voice" },
    ],
  },
  {
    id: "friends",
    emoji: "🫂",
    label: "Para meus amigos",
    channels: [
      { name: "geral", kind: "text" },
      { name: "fotos", kind: "text" },
      { name: "Sala de voz", kind: "voice" },
    ],
  },
  {
    id: "study",
    emoji: "📚",
    label: "Grupo de estudo",
    channels: [
      { name: "geral", kind: "text" },
      { name: "materiais", kind: "text" },
      { name: "duvidas", kind: "text" },
      { name: "Sala de estudo", kind: "voice" },
    ],
  },
  {
    id: "club",
    emoji: "🎨",
    label: "Clube escolar",
    channels: [
      { name: "geral", kind: "text" },
      { name: "avisos", kind: "text" },
      { name: "projetos", kind: "text" },
      { name: "Reuniões", kind: "voice" },
    ],
  },
];

/** A resposta da etapa 2 decide se o servidor entra na vitrine de Comunidades. */
const AUDIENCES = [
  {
    id: "community" as const,
    emoji: "🌍",
    label: "Para um clube ou comunidade",
    hint: "Aparece na vitrine de Comunidades",
    isPublic: true,
  },
  {
    id: "friends" as const,
    emoji: "🛋️",
    label: "Para mim e meus amigos",
    hint: "Só entra quem tiver o convite",
    isPublic: false,
  },
];

type Step = "template" | "audience" | "customize" | "join";

export function CreateServerFlow({
  open,
  onOpenChange,
  userId,
  onCreated,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: (serverId: string) => void;
  onJoined: (serverId: string) => void;
}) {
  const [step, setStep] = useState<Step>("template");
  const [template, setTemplate] = useState<Template>(OWN_TEMPLATE);
  const [isPublic, setIsPublic] = useState(true);
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("template");
    setTemplate(OWN_TEMPLATE);
    setIsPublic(true);
    setName("");
    setIconUrl(null);
    setCode("");
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) window.setTimeout(reset, 200);
  };

  const pickTemplate = (chosen: Template) => {
    setTemplate(chosen);
    setName((current) => current || `Servidor de ${chosen.label.toLowerCase()}`);
    setStep("audience");
  };

  /**
   * O ícone vai para o bucket `profile-media`, dentro da pasta do próprio
   * usuário — é o que a política de escrita exige, e o bucket já é de leitura
   * pública, então serve para o ícone do servidor sem precisar de outro.
   */
  const uploadIcon = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("A imagem precisa ter até 2 MB.");
      return;
    }
    setUploading(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/server-${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("profile-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);

    if (error) {
      toast.error(
        /bucket/i.test(error.message)
          ? "O armazenamento de imagens ainda não existe. Aplique a migração profile_media no Supabase."
          : "Não foi possível enviar a imagem.",
      );
      return;
    }
    const { data } = supabase.storage.from("profile-media").getPublicUrl(path);
    setIconUrl(data.publicUrl);
  };

  const createServer = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("servers")
      .insert({
        name: name.trim(),
        owner_id: userId,
        is_public: isPublic,
        icon_url: iconUrl,
      })
      .select("id")
      .single();

    if (error || !data) {
      setBusy(false);
      toast.error("Não foi possível criar o servidor.");
      return;
    }

    await supabase.from("server_members").insert({
      server_id: data.id,
      user_id: userId,
      role: "owner",
    });
    await supabase.from("channels").insert(
      template.channels.map((channel, position) => ({
        server_id: data.id,
        name: channel.name,
        kind: channel.kind,
        position,
      })),
    );

    setBusy(false);
    close(false);
    onCreated(data.id);
    toast.success("Servidor criado.");
  };

  const joinServer = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("join_server_by_invite", { _code: code.trim() });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar.");
      return;
    }
    if (!data) {
      toast.error("Convite inválido.");
      return;
    }
    close(false);
    onJoined(data);
    toast.success("Você entrou no servidor.");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[26rem] gap-0 overflow-hidden rounded-lg p-0"
      >
        <button
          type="button"
          onClick={() => close(false)}
          aria-label="Fechar"
          className="absolute right-4 top-4 z-10 rounded p-1 text-muted-foreground transition-colors duration-100 hover:text-foreground"
        >
          <X size={20} />
        </button>

        {step === "template" && (
          <StepShell
            title="Crie seu servidor"
            description="Seu servidor é onde você se reúne com a sua gente. Crie o seu e comece a conversar."
          >
            <OptionRow
              emoji={OWN_TEMPLATE.emoji}
              label={OWN_TEMPLATE.label}
              highlighted
              onClick={() => pickTemplate(OWN_TEMPLATE)}
            />

            <p className="px-1 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
              Comece com um modelo
            </p>
            <div className="space-y-2">
              {TEMPLATES.map((item) => (
                <OptionRow
                  key={item.id}
                  emoji={item.emoji}
                  label={item.label}
                  hint={`${item.channels.length} canais`}
                  onClick={() => pickTemplate(item)}
                />
              ))}
            </div>

            <div className="mt-6 border-t border-border pt-5 text-center">
              <p className="text-base font-semibold">Já tem um convite?</p>
              <Button
                variant="secondary"
                className="mt-3 h-11 w-full font-medium"
                onClick={() => setStep("join")}
              >
                Entrar em um servidor
              </Button>
            </div>
          </StepShell>
        )}

        {step === "audience" && (
          <StepShell
            title="Conte um pouco sobre seu servidor"
            description="Para ajudar na configuração, queremos saber se ele é só para algumas pessoas ou para uma comunidade maior."
          >
            <div className="space-y-2">
              {AUDIENCES.map((option) => (
                <OptionRow
                  key={option.id}
                  emoji={option.emoji}
                  label={option.label}
                  hint={option.hint}
                  onClick={() => {
                    setIsPublic(option.isPublic);
                    setStep("customize");
                  }}
                />
              ))}
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Não sabe ainda? Você pode{" "}
              <button
                type="button"
                onClick={() => setStep("customize")}
                className="cursor-pointer text-brand-soft hover:underline"
              >
                pular esta pergunta
              </button>{" "}
              por enquanto.
            </p>

            <FooterNav onBack={() => setStep("template")} />
          </StepShell>
        )}

        {step === "customize" && (
          <StepShell
            title="Personalize seu servidor"
            description="Dê uma cara própria ao servidor com um nome e um ícone. Sempre dá para mudar depois."
          >
            <div className="flex justify-center pb-6 pt-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  aria-label="Enviar ícone do servidor"
                  className={cn(
                    "flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground",
                    iconUrl ? "" : "border-2 border-dashed border-muted-foreground/60",
                  )}
                >
                  {iconUrl ? (
                    <img src={iconUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1">
                      <Camera size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        {uploading ? "…" : "Subir"}
                      </span>
                    </span>
                  )}
                </button>
                <span className="pointer-events-none absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white ring-4 ring-popover">
                  <Plus size={14} />
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadIcon(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <Label
              htmlFor="server-name"
              className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground"
            >
              Nome do servidor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="server-name"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void createServer()}
              className="mt-2 h-10 rounded border-transparent bg-rail"
            />
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Ao criar um servidor, você concorda com as diretrizes de comunidade do Clyro.
            </p>

            <FooterNav
              onBack={() => setStep("audience")}
              action={
                <Button
                  className="h-10 px-6 font-medium"
                  disabled={busy || !name.trim()}
                  onClick={() => void createServer()}
                >
                  {busy ? "Criando…" : "Criar"}
                </Button>
              }
            />
          </StepShell>
        )}

        {step === "join" && (
          <StepShell
            title="Entrar em um servidor"
            description="Cole o código de convite que alguém te mandou."
          >
            <Label
              htmlFor="invite"
              className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground"
            >
              Código de convite <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite"
              value={code}
              autoFocus
              placeholder="a1b2c3d4"
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void joinServer()}
              className="mt-2 h-10 rounded border-transparent bg-rail"
            />

            <FooterNav
              onBack={() => setStep("template")}
              action={
                <Button
                  className="h-10 px-6 font-medium"
                  disabled={busy || !code.trim()}
                  onClick={() => void joinServer()}
                >
                  {busy ? "Entrando…" : "Entrar"}
                </Button>
              }
            />
          </StepShell>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="clyro-fade-in px-6 pb-6 pt-8">
      <DialogTitle className="text-center text-2xl font-bold tracking-[-0.01em]">
        {title}
      </DialogTitle>
      <p className="mx-auto mb-6 mt-2 max-w-[22rem] text-center text-[15px] leading-snug text-muted-foreground">
        {description}
      </p>
      {children}
    </div>
  );
}

function OptionRow({
  emoji,
  label,
  hint,
  highlighted,
  onClick,
}: {
  emoji: string;
  label: string;
  hint?: string;
  highlighted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-100",
        highlighted
          ? "border-brand/60 bg-brand/10 hover:bg-brand/20"
          : "border-border bg-card hover:bg-[var(--color-muted)]",
      )}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

function FooterNav({ onBack, action }: { onBack: () => void; action?: React.ReactNode }) {
  return (
    <div className="-mx-6 -mb-6 mt-6 flex items-center bg-rail px-6 py-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-100 hover:text-foreground hover:underline"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
