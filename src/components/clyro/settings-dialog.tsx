import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { setAudioSetting, useAudioSettings, type AudioSettings } from "@/lib/audio-settings";
import { UserAvatar } from "./primitives";

const BIO_LIMIT = 280;
const DEFAULT_BANNER = "#2b2b2f";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [activity, setActivity] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bio, setBio] = useState("");
  const [bannerColor, setBannerColor] = useState(DEFAULT_BANNER);
  const [bannerUrl, setBannerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);

  // Recarrega os campos toda vez que o painel abre, para não editar valores velhos.
  useEffect(() => {
    if (!open || !profile) return;
    setDisplayName(profile.display_name ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
    setActivity(profile.activity ?? "");
    setPronouns(profile.pronouns ?? "");
    setBio(profile.bio ?? "");
    setBannerColor(profile.banner_color ?? DEFAULT_BANNER);
    setBannerUrl(profile.banner_url ?? "");
  }, [open, profile]);

  /**
   * Sobe a imagem para o bucket `profile-media`, sempre dentro da pasta do
   * próprio usuário — é o que a política de escrita exige.
   */
  const uploadImage = async (file: File, kind: "avatar" | "banner") => {
    if (!profile) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("A imagem precisa ter até 2 MB.");
      return;
    }

    setUploading(kind);
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${profile.id}/${kind}-${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("profile-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(null);

    if (error) {
      // Bucket ausente é o caso esperado antes da migração de mídia rodar.
      const missingBucket = /bucket/i.test(error.message);
      toast.error(
        missingBucket
          ? "O armazenamento de imagens ainda não existe. Aplique a migração profile_media no Supabase."
          : "Não foi possível enviar a imagem.",
      );
      return;
    }

    const { data } = supabase.storage.from("profile-media").getPublicUrl(path);
    if (kind === "avatar") setAvatarUrl(data.publicUrl);
    else setBannerUrl(data.publicUrl);
    toast.success("Imagem enviada. Salve para aplicar.");
  };

  const save = async () => {
    if (!profile) return;
    setBusy(true);

    const base = {
      display_name: displayName.trim() || profile.username,
      avatar_url: avatarUrl.trim() || null,
      activity: activity.trim() || null,
    };
    const custom = {
      pronouns: pronouns.trim() || null,
      bio: bio.trim() || null,
      banner_color: bannerColor,
      banner_url: bannerUrl.trim() || null,
    };

    // Os tipos gerados ainda não conhecem as colunas de personalização (migração
    // 20260821200000). O cast sai sozinho quando os tipos forem regerados.
    const payload = { ...base, ...custom } as unknown as typeof base;
    const { error } = await supabase.from("profiles").update(payload).eq("id", profile.id);

    if (error) {
      // Colunas de personalização ainda não existem: salva o resto e avisa,
      // em vez de perder o que a pessoa acabou de escrever.
      const missingColumn = error.code === "PGRST204" || error.code === "42703";
      if (missingColumn) {
        const retry = await supabase.from("profiles").update(base).eq("id", profile.id);
        setBusy(false);
        if (retry.error) {
          toast.error("Não foi possível salvar o perfil.");
          return;
        }
        await refreshProfile();
        toast.warning(
          "Nome, avatar e atividade salvos. Pronomes, bio e cor precisam da migração de personalização no Supabase.",
        );
        onOpenChange(false);
        return;
      }
      setBusy(false);
      toast.error("Não foi possível salvar o perfil.");
      return;
    }

    setBusy(false);
    await refreshProfile();
    toast.success("Perfil atualizado.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>
            @{profile?.username} — este é o nome que as pessoas usam para te adicionar.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="profile">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1">
              Perfil
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex-1">
              Voz e vídeo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            <div className="grid gap-5 sm:grid-cols-[1fr_240px]">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="display-name">Nome de exibição</Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pronouns">Pronomes</Label>
                  <Input
                    id="pronouns"
                    value={pronouns}
                    onChange={(e) => setPronouns(e.target.value.slice(0, 40))}
                    placeholder="ele/dele, ela/dela, elu/delu…"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Foto de perfil</Label>
                  <ImageField
                    kind="avatar"
                    value={avatarUrl}
                    busy={uploading === "avatar"}
                    onPick={(file) => void uploadImage(file, "avatar")}
                    onChange={setAvatarUrl}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Banner</Label>
                  <ImageField
                    kind="banner"
                    value={bannerUrl}
                    busy={uploading === "banner"}
                    onPick={(file) => void uploadImage(file, "banner")}
                    onChange={setBannerUrl}
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="banner-color"
                      type="color"
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent"
                    />
                    <Input
                      value={bannerColor}
                      onChange={(e) => setBannerColor(e.target.value)}
                      className="font-mono text-xs"
                      aria-label="Cor do banner em hexadecimal"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A cor aparece quando não há imagem de banner.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="bio">Sobre mim</Label>
                    <span className="text-xs text-muted-foreground">
                      {bio.length}/{BIO_LIMIT}
                    </span>
                  </div>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, BIO_LIMIT))}
                    rows={3}
                    placeholder="Uma linha sobre você."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="activity">Atividade atual</Label>
                  <Input
                    id="activity"
                    value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                    placeholder="Codando o Clyro"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Prévia</Label>
                <ProfilePreview
                  displayName={displayName || profile?.username || ""}
                  username={profile?.username ?? ""}
                  avatarUrl={avatarUrl}
                  bannerColor={bannerColor}
                  bannerUrl={bannerUrl}
                  pronouns={pronouns}
                  bio={bio}
                />
              </div>
            </div>

            <Button className="mt-5 w-full" onClick={() => void save()} disabled={busy}>
              {busy ? "Salvando…" : "Salvar perfil"}
            </Button>
          </TabsContent>

          <TabsContent value="voice" className="space-y-1 pt-4">
            <p className="pb-2 text-sm text-muted-foreground">
              Tratamento aplicado ao seu microfone. Fica ligado por padrão e vale já na chamada em
              andamento.
            </p>
            <AudioToggle
              field="noiseSuppression"
              title="Supressão de ruído"
              body="Corta ruído de fundo constante — ventilador, teclado, rua."
            />
            <AudioToggle
              field="echoCancellation"
              title="Cancelamento de eco"
              body="Evita que o som das suas caixas volte pelo microfone."
            />
            <AudioToggle
              field="autoGainControl"
              title="Nivelar volume"
              body="Ajusta o ganho para sua voz sair sempre no mesmo nível."
            />
            <p className="pt-3 text-xs text-muted-foreground">
              Alguns microfones não aceitam trocar isso no meio da chamada; nesse caso vale na
              próxima vez que você entrar.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function AudioToggle({
  field,
  title,
  body,
}: {
  field: keyof AudioSettings;
  title: string;
  body: string;
}) {
  const settings = useAudioSettings();
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <Label htmlFor={field} className="text-sm font-medium">
          {title}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      </div>
      <Switch
        id={field}
        checked={settings[field]}
        onCheckedChange={(checked) => setAudioSetting(field, checked)}
      />
    </div>
  );
}

/** Envio de imagem com prévia, mais o campo de URL para quem preferir colar. */
function ImageField({
  kind,
  value,
  busy,
  onPick,
  onChange,
}: {
  kind: "avatar" | "banner";
  value: string;
  busy: boolean;
  onPick: (file: File) => void;
  onChange: (value: string) => void;
}) {
  const inputId = `${kind}-file`;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "shrink-0 overflow-hidden border border-border bg-secondary",
            kind === "avatar" ? "h-12 w-12 rounded-full" : "h-12 w-20 rounded-lg",
          )}
        >
          {value && <img src={value} alt="" className="h-full w-full object-cover" />}
        </span>

        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            // Permite reenviar o mesmo arquivo depois de um erro.
            e.target.value = "";
          }}
        />
        <Button asChild size="sm" variant="secondary" disabled={busy}>
          <label htmlFor={inputId} className="cursor-pointer">
            <Upload size={14} /> {busy ? "Enviando…" : "Enviar imagem"}
          </label>
        </Button>

        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange("")}>
            Remover
          </Button>
        )}
      </div>

      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ou cole uma URL: https://…"
        className="text-xs"
        aria-label={kind === "avatar" ? "URL do avatar" : "URL do banner"}
      />
    </div>
  );
}

function ProfilePreview({
  displayName,
  username,
  avatarUrl,
  bannerColor,
  bannerUrl,
  pronouns,
  bio,
}: {
  displayName: string;
  username: string;
  avatarUrl: string;
  bannerColor: string;
  bannerUrl: string;
  pronouns: string;
  bio: string;
}) {
  const preview = {
    id: "preview",
    username,
    display_name: displayName,
    avatar_url: avatarUrl.trim() || null,
    status: "online" as const,
    activity: null,
    created_at: new Date().toISOString(),
  };

  return (
    <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-card">
      <div className="h-16 w-full" style={{ backgroundColor: bannerColor }}>
        {bannerUrl && <img src={bannerUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="px-4 pb-4">
        <div className="-mt-7 mb-2">
          <span className="inline-block rounded-full ring-4 ring-card">
            <UserAvatar profile={preview} size={56} showStatus={false} />
          </span>
        </div>
        <p className="truncate text-sm font-semibold">{displayName || "Seu nome"}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{username}
          {pronouns.trim() ? ` · ${pronouns.trim()}` : ""}
        </p>
        {bio.trim() && <p className="mt-2 whitespace-pre-line text-xs">{bio.trim()}</p>}
      </div>
    </div>
  );
}
