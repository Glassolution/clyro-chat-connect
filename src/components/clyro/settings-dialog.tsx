import { useEffect, useState } from "react";
import { Mic, MonitorUp, Upload } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  getMediaSettings,
  openMicrophone,
  screenBitrate,
  setMediaSetting,
  supportsOutputSelection,
  useAudioDevices,
  useMediaSettings,
  voiceBitrate,
  SCREEN_FPS,
  SCREEN_RESOLUTIONS,
  type AudioDevice,
  type MediaSettings,
  type ScreenFps,
  type ScreenResolution,
} from "@/lib/media-settings";
import { uploadProfileImage } from "@/lib/profile-media";
import { MediaImage, UserAvatar } from "./primitives";

const BIO_LIMIT = 280;
const DEFAULT_BANNER = "#2b2b2f";

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
   * Sobe a imagem para o bucket privado e guarda o link assinado que voltou —
   * é ele que vai para o perfil.
   */
  const uploadImage = async (file: File, kind: "avatar" | "banner") => {
    if (!profile) return;
    setUploading(kind);
    const result = await uploadProfileImage(profile.id, file, kind);
    setUploading(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (kind === "avatar") setAvatarUrl(result.url);
    else setBannerUrl(result.url);
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
              Voz
            </TabsTrigger>
            <TabsTrigger value="screen" className="flex-1">
              Tela
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

          <TabsContent value="voice" className="max-h-[62vh] space-y-1 overflow-y-auto pr-1 pt-4">
            <AudioDevices />

            <p className="pb-2 pt-4 text-sm text-muted-foreground">
              Tratamento aplicado ao seu microfone. Vale já na chamada em andamento.
            </p>
            <AudioToggle
              field="voiceFilter"
              title="Filtro de voz"
              body="Uma rede separa a sua voz do resto — teclado, ventilador, TV, gente falando ao fundo — enquanto você fala. Roda aqui no navegador; nada é enviado para lugar nenhum."
            />
            <AudioToggle
              field="noiseSuppression"
              title="Supressão de ruído do navegador"
              body="A limpeza simples que o próprio navegador faz. Fica de fora enquanto o filtro de voz estiver ligado — os dois juntos deixam a voz com som de telefone."
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
            <AudioToggle
              field="noiseGate"
              title="Silêncio total nas pausas"
              body="Fecha o microfone entre as suas falas. Com o filtro ligado quase não faz diferença — e, se a sua voz sair picotada, é o primeiro a desligar."
            />
            <p className="pt-3 text-xs text-muted-foreground">
              Vale na hora, inclusive na chamada em andamento: se o microfone não aceitar a troca ao
              vivo, ele é reaberto sem derrubar a call.
            </p>

            <VoiceQualitySettings />
          </TabsContent>

          <TabsContent value="screen" className="max-h-[62vh] space-y-3 overflow-y-auto pr-1 pt-4">
            <ScreenQualitySettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Qualidade da voz que sai daqui. Vale na chamada em andamento — o hook
 * renegocia sozinho em vez de pedir para sair e entrar.
 */
function VoiceQualitySettings() {
  const settings = useMediaSettings();
  const hiFiKbps = voiceBitrate({ ...settings, highFidelity: true }) / 1000;
  const plainKbps = voiceBitrate({ ...settings, highFidelity: false }) / 1000;

  return (
    <div className="space-y-3 pt-5">
      <div>
        <h3 className="text-sm font-semibold">Qualidade da voz</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Alta fidelidade manda Opus em estéreo a 48 kHz e {hiFiKbps} kbps — qualidade de música em
          vez de telefonia. Gasta mais banda; desligue em conexão apertada.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-3">
        <div className="min-w-0">
          <Label htmlFor="highFidelity" className="text-sm font-medium">
            Alta fidelidade
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {settings.highFidelity
              ? `Estéreo 48 kHz · ${hiFiKbps} kbps`
              : `Mono 48 kHz · ${plainKbps} kbps (economiza banda)`}
          </p>
        </div>
        <Switch
          id="highFidelity"
          checked={settings.highFidelity}
          onCheckedChange={(checked) => setMediaSetting("highFidelity", checked)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Com supressão de ruído ou cancelamento de eco ligados, o navegador entrega o microfone em
        mono — o envio continua em alta taxa, mas o estéreo só sai com os dois desligados.
      </p>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-3">
        <div className="min-w-0">
          <Label htmlFor="sounds" className="text-sm font-medium">
            Sons da chamada
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Avisos curtos ao entrar, sair e começar uma transmissão de tela.
          </p>
        </div>
        <Switch
          id="sounds"
          checked={settings.sounds}
          onCheckedChange={(checked) => setMediaSetting("sounds", checked)}
        />
      </div>
    </div>
  );
}

/**
 * Resolução e taxa de quadros da tela compartilhada. Mexer aqui durante uma
 * transmissão vale na hora, sem precisar recomeçar o compartilhamento.
 */
function ScreenQualitySettings() {
  const settings = useMediaSettings();
  const megabits = (screenBitrate(settings) / 1_000_000).toFixed(1);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MonitorUp size={14} /> Transmissão de tela
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O que você escolher aqui vale para a próxima transmissão e também para a que já estiver no
          ar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="screen-resolution">Resolução</Label>
          <Select
            value={String(settings.screenResolution)}
            onValueChange={(value) =>
              setMediaSetting("screenResolution", Number(value) as ScreenResolution)
            }
          >
            <SelectTrigger id="screen-resolution">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCREEN_RESOLUTIONS.map((height) => (
                <SelectItem key={height} value={String(height)}>
                  {RESOLUTION_LABEL[height]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="screen-fps">Quadros por segundo</Label>
          <Select
            value={String(settings.screenFps)}
            onValueChange={(value) => setMediaSetting("screenFps", Number(value) as ScreenFps)}
          >
            <SelectTrigger id="screen-fps">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCREEN_FPS.map((fps) => (
                <SelectItem key={fps} value={String(fps)}>
                  {FPS_LABEL[fps]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O bitrate acompanha a escolha: cerca de {megabits} Mbps nesta combinação. Resoluções e taxas
        altas dependem da sua banda de subida e do que a origem da captura entrega — uma janela
        pequena não vira 4K.
      </p>
    </div>
  );
}

const RESOLUTION_LABEL: Record<ScreenResolution, string> = {
  720: "720p — HD",
  1080: "1080p — Full HD",
  1440: "1440p — QHD",
  2160: "2160p — 4K",
};

const FPS_LABEL: Record<ScreenFps, string> = {
  15: "15 fps — leve",
  30: "30 fps — equilibrado",
  60: "60 fps — movimento",
};

/** Valor do "sem preferência": o Select do Radix não aceita item vazio. */
const SYSTEM_DEFAULT = "system-default";

/**
 * Escolha de microfone e de saída. A troca vale na hora — inclusive no meio de
 * uma chamada, porque o hook de voz substitui a faixa em vez de reabrir a call.
 */
function AudioDevices() {
  const settings = useMediaSettings();
  const { inputs, outputs, needsPermission, requestPermission } = useAudioDevices();
  const [testing, setTesting] = useState(false);
  const level = useMicLevel(testing, settings.inputDeviceId);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="input-device">Microfone</Label>
          <DeviceSelect
            id="input-device"
            value={settings.inputDeviceId}
            devices={inputs}
            onChange={(value) => setMediaSetting("inputDeviceId", value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="output-device">Fone de ouvido / saída</Label>
          <DeviceSelect
            id="output-device"
            value={settings.outputDeviceId}
            devices={outputs}
            disabled={!supportsOutputSelection}
            onChange={(value) => setMediaSetting("outputDeviceId", value)}
          />
        </div>
      </div>

      {needsPermission && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">
            Libere o microfone uma vez para o navegador mostrar o nome dos dispositivos.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void requestPermission()}>
            Liberar
          </Button>
        </div>
      )}

      {!supportsOutputSelection && (
        <p className="text-xs text-muted-foreground">
          Este navegador não deixa escolher a saída pela página — o som segue o padrão do sistema.
          No Chrome ou no Edge a escolha funciona.
        </p>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
        <Button size="sm" variant="secondary" onClick={() => setTesting((prev) => !prev)}>
          <Mic size={14} /> {testing ? "Parar teste" : "Testar microfone"}
        </Button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function DeviceSelect({
  id,
  value,
  devices,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  devices: AudioDevice[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const missing = value.length > 0 && !devices.some((d) => d.deviceId === value);
  return (
    <Select
      value={value || SYSTEM_DEFAULT}
      disabled={disabled ?? false}
      onValueChange={(next) => onChange(next === SYSTEM_DEFAULT ? "" : next)}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Padrão do sistema" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SYSTEM_DEFAULT}>Padrão do sistema</SelectItem>
        {devices.map((device) => (
          <SelectItem key={device.deviceId} value={device.deviceId}>
            {device.label}
          </SelectItem>
        ))}
        {/* O aparelho salvo pode estar desconectado agora: melhor mostrar isso
            do que deixar o campo em branco. */}
        {missing && <SelectItem value={value}>Aparelho escolhido (desconectado)</SelectItem>}
      </SelectContent>
    </Select>
  );
}

/** Nível do microfone escolhido, só enquanto o teste está ligado. */
function useMicLevel(active: boolean, deviceId: string) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      return;
    }
    let stopped = false;
    let frame = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    const run = async () => {
      stream = await openMicrophone({ ...getMediaSettings(), inputDeviceId: deviceId });
      if (!stream || stopped) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const v = ((buffer[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        // Sobe na hora e desce devagar, para a barra não piscar entre sílabas.
        setLevel((prev) => Math.min(1, Math.max(rms * 4, prev * 0.88)));
        frame = window.requestAnimationFrame(tick);
      };
      tick();
    };
    void run();

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };
  }, [active, deviceId]);

  return level;
}

/** Só as preferências de tratamento — as de dispositivo não são interruptores. */
type AudioToggleField = {
  [K in keyof MediaSettings]: MediaSettings[K] extends boolean ? K : never;
}[keyof MediaSettings];

function AudioToggle({
  field,
  title,
  body,
}: {
  field: AudioToggleField;
  title: string;
  body: string;
}) {
  const settings = useMediaSettings();
  // A supressão do navegador não se acumula com o filtro: enquanto ele estiver
  // ligado, este controle fica de fora do caminho e o botão mostra isso.
  const supersededByFilter = field === "noiseSuppression" && settings.voiceFilter;

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
        disabled={supersededByFilter}
        checked={supersededByFilter ? false : settings[field]}
        onCheckedChange={(checked) => setMediaSetting(field, checked)}
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
          <MediaImage src={value} className="h-full w-full object-cover" />
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
        <MediaImage src={bannerUrl} className="h-full w-full object-cover" />
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
