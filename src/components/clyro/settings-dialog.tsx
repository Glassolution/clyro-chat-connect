import { useEffect, useId, useRef, useState } from "react";
import { Brush2, Monitor, Moon, ProfileCircle, Sun1 } from "iconsax-react";
import { ChevronDown, Mic, MonitorUp, Settings, Upload, X } from "@/components/icons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "@/lib/theme";
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

const SETTINGS_TAB =
  "h-10 flex-1 justify-center gap-2 rounded-[12px] px-2 text-[13px] focus-visible:ring-brand focus-visible:ring-offset-0 data-[state=active]:bg-brand-soft data-[state=active]:text-brand-ink data-[state=active]:shadow-none md:w-full md:flex-none md:justify-start md:px-3";
const SETTINGS_SCROLL = "min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain clyro-scroll";
const SETTINGS_CONTENT = "mx-auto w-full max-w-5xl px-4 py-5 sm:px-7 sm:py-7 lg:px-10";
const SETTINGS_CONTROL = "h-10 rounded-[12px] bg-muted/40 shadow-none";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const isMobile = useIsMobile();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const profileFormId = useId();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [activity, setActivity] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bio, setBio] = useState("");
  const [bannerColor, setBannerColor] = useState(DEFAULT_BANNER);
  const [bannerUrl, setBannerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState({ avatar: false, banner: false });
  const isUploading = uploading.avatar || uploading.banner;

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
    if (!profile || busy || uploading[kind]) return;
    setUploading((current) => ({ ...current, [kind]: true }));
    try {
      const result = await uploadProfileImage(profile.id, file, kind);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (kind === "avatar") setAvatarUrl(result.url);
      else setBannerUrl(result.url);
      toast.success("Imagem enviada. Salve para aplicar.");
    } catch {
      toast.error("Não foi possível enviar a imagem.");
    } finally {
      setUploading((current) => ({ ...current, [kind]: false }));
    }
  };

  const save = async () => {
    if (!profile || busy || isUploading) return;
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
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        overlayClassName="bg-black/40 backdrop-blur-[4px] duration-200 motion-reduce:animate-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus({ preventScroll: true });
        }}
        className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-[22px] border-border bg-card p-0 shadow-[0_28px_90px_-18px_rgb(0_0_0/0.3)] duration-300 ease-clyro data-[state=closed]:duration-150 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98 motion-reduce:animate-none sm:h-[calc(100dvh-2.5rem)] sm:w-[calc(100%-2.5rem)] sm:rounded-[28px]"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand sm:size-10">
            <Settings size={21} />
          </span>
          <DialogTitle
            ref={headingRef}
            tabIndex={-1}
            className="min-w-0 flex-1 text-left text-[19px] font-semibold tracking-[-0.025em] outline-none sm:text-[21px]"
          >
            Configurações
          </DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground"
              aria-label="Fechar configurações"
            >
              <X size={18} />
            </Button>
          </DialogClose>
        </header>

        <Tabs
          defaultValue="profile"
          orientation={isMobile ? "horizontal" : "vertical"}
          className="flex min-h-0 flex-1 flex-col md:flex-row"
        >
          <TabsList
            aria-label="Seções das configurações"
            className="flex h-auto shrink-0 items-stretch justify-start gap-1 rounded-none border-b border-border bg-muted/40 px-3 py-2 md:w-48 md:flex-col md:border-b-0 md:border-r md:p-3 lg:w-56 lg:p-4"
          >
            <TabsTrigger value="profile" className={SETTINGS_TAB}>
              <ProfileCircle size={18} color="currentColor" aria-hidden="true" /> Perfil
            </TabsTrigger>
            <TabsTrigger value="voice" className={SETTINGS_TAB}>
              <Mic size={18} /> Voz
            </TabsTrigger>
            <TabsTrigger value="screen" className={SETTINGS_TAB}>
              <MonitorUp size={18} /> Tela
            </TabsTrigger>
            <TabsTrigger value="appearance" className={SETTINGS_TAB}>
              <Brush2 size={18} color="currentColor" aria-hidden="true" /> Aparência
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="profile"
            className="mt-0 min-h-0 min-w-0 flex-1 flex-col focus-visible:ring-inset data-[state=active]:flex"
          >
            <div className={SETTINGS_SCROLL}>
              <div
                className={cn(
                  SETTINGS_CONTENT,
                  "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)]",
                )}
              >
                <form
                  id={profileFormId}
                  className="min-w-0 space-y-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <section aria-labelledby="settings-profile-heading" className="space-y-4">
                    <h2
                      id="settings-profile-heading"
                      className="text-lg font-semibold tracking-tight"
                    >
                      Informações do perfil
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="display-name">Nome de exibição</Label>
                        <Input
                          id="display-name"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          className={SETTINGS_CONTROL}
                        />
                      </div>
                      <div className="min-w-0 space-y-2">
                        <Label htmlFor="pronouns">Pronomes</Label>
                        <Input
                          id="pronouns"
                          value={pronouns}
                          onChange={(event) => setPronouns(event.target.value.slice(0, 40))}
                          placeholder="ele/dele, ela/dela, elu/delu…"
                          className={SETTINGS_CONTROL}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <Label htmlFor="bio">Sobre mim</Label>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {bio.length}/{BIO_LIMIT}
                        </span>
                      </div>
                      <Textarea
                        id="bio"
                        value={bio}
                        onChange={(event) => setBio(event.target.value.slice(0, BIO_LIMIT))}
                        rows={3}
                        placeholder="Uma linha sobre você."
                        className="rounded-[12px] bg-muted/40 shadow-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity">Atividade atual</Label>
                      <Input
                        id="activity"
                        value={activity}
                        onChange={(event) => setActivity(event.target.value)}
                        placeholder="Codando o Clyro"
                        className={SETTINGS_CONTROL}
                      />
                    </div>
                  </section>

                  <section
                    aria-labelledby="settings-media-heading"
                    className="space-y-4 border-t border-border pt-5"
                  >
                    <h2
                      id="settings-media-heading"
                      className="text-base font-semibold tracking-tight"
                    >
                      Foto e banner
                    </h2>
                    <ImageField
                      kind="avatar"
                      value={avatarUrl}
                      busy={uploading.avatar}
                      onPick={(file) => void uploadImage(file, "avatar")}
                      onChange={setAvatarUrl}
                    />
                    <ImageField
                      kind="banner"
                      value={bannerUrl}
                      busy={uploading.banner}
                      onPick={(file) => void uploadImage(file, "banner")}
                      onChange={setBannerUrl}
                    />
                    <div className="space-y-2">
                      <Label htmlFor="banner-color-hex">Cor do banner</Label>
                      <div className="flex max-w-44 items-center gap-2">
                        <input
                          type="color"
                          value={bannerColor}
                          onChange={(event) => setBannerColor(event.target.value)}
                          className="h-10 w-11 shrink-0 cursor-pointer rounded-[10px] border border-input bg-card p-1"
                          aria-label="Selecionar a cor do banner"
                        />
                        <Input
                          id="banner-color-hex"
                          value={bannerColor}
                          onChange={(event) => setBannerColor(event.target.value)}
                          className={cn(SETTINGS_CONTROL, "font-mono text-sm")}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Usada quando o banner está sem imagem.
                      </p>
                    </div>
                  </section>
                </form>

                <section
                  aria-labelledby="settings-preview-heading"
                  className="min-w-0 lg:sticky lg:top-5"
                >
                  <h2
                    id="settings-preview-heading"
                    className="mb-2 text-sm font-medium text-muted-foreground"
                  >
                    Prévia do perfil
                  </h2>
                  <ProfilePreview
                    displayName={displayName || profile?.username || ""}
                    username={profile?.username ?? ""}
                    avatarUrl={avatarUrl}
                    bannerColor={bannerColor}
                    bannerUrl={bannerUrl}
                    pronouns={pronouns}
                    bio={bio}
                  />
                </section>
              </div>
            </div>

            <footer className="shrink-0 border-t border-border bg-card">
              <div className="mx-auto flex w-full max-w-5xl justify-end px-4 py-3 sm:px-7 lg:px-10">
                <Button
                  type="submit"
                  form={profileFormId}
                  className="h-10 w-full rounded-full px-6 shadow-none sm:w-auto"
                  disabled={!profile || busy || isUploading}
                >
                  {busy ? "Salvando…" : "Salvar perfil"}
                </Button>
              </div>
            </footer>
          </TabsContent>

          <TabsContent
            value="voice"
            className={cn("mt-0 focus-visible:ring-inset", SETTINGS_SCROLL)}
          >
            <div className={cn(SETTINGS_CONTENT, "space-y-5")}>
              <section aria-labelledby="settings-audio-heading" className="space-y-3">
                <h2 id="settings-audio-heading" className="text-lg font-semibold tracking-tight">
                  Dispositivos de áudio
                </h2>
                <AudioDevices />
              </section>

              <section
                aria-labelledby="settings-mic-heading"
                className="space-y-2 border-t border-border pt-5"
              >
                <h2
                  id="settings-mic-heading"
                  className="mb-3 text-base font-semibold tracking-tight"
                >
                  Tratamento do microfone
                </h2>
                <NoiseSuppressionSetting />
                <AudioToggle
                  field="echoCancellation"
                  title="Cancelamento de eco"
                  body="Evita que o som dos alto-falantes volte pelo microfone."
                />
                <AudioToggle
                  field="autoGainControl"
                  title="Nivelar volume"
                  body="Mantém sua voz no mesmo nível de volume."
                />
                <AudioToggle
                  field="noiseGate"
                  title="Silêncio nas pausas"
                  body="Fecha o microfone entre as falas. Desative se sua voz ficar cortada."
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  Os ajustes valem durante a chamada em andamento.
                </p>
              </section>

              <VoiceQualitySettings />
            </div>
          </TabsContent>

          <TabsContent
            value="screen"
            className={cn("mt-0 focus-visible:ring-inset", SETTINGS_SCROLL)}
          >
            <div className={SETTINGS_CONTENT}>
              <ScreenQualitySettings />
            </div>
          </TabsContent>

          <TabsContent
            value="appearance"
            className={cn("mt-0 focus-visible:ring-inset", SETTINGS_SCROLL)}
          >
            <div className={SETTINGS_CONTENT}>
              <AppearanceSettings />
            </div>
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
    <section
      aria-labelledby="settings-voice-quality-heading"
      className="space-y-3 border-t border-border pt-5"
    >
      <div>
        <h2 id="settings-voice-quality-heading" className="text-base font-semibold tracking-tight">
          Qualidade da voz
        </h2>
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
    </section>
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
    <section aria-labelledby="settings-screen-heading" className="max-w-2xl space-y-4">
      <div>
        <h2 id="settings-screen-heading" className="text-lg font-semibold tracking-tight">
          Transmissão de tela
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Os ajustes valem para a transmissão atual e para as próximas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="screen-resolution">Resolução</Label>
          <Select
            value={String(settings.screenResolution)}
            onValueChange={(value) =>
              setMediaSetting("screenResolution", Number(value) as ScreenResolution)
            }
          >
            <SelectTrigger id="screen-resolution" className={SETTINGS_CONTROL}>
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
            <SelectTrigger id="screen-fps" className={SETTINGS_CONTROL}>
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
    </section>
  );
}

const THEME_CHOICES: {
  id: ThemeChoice;
  label: string;
  body: string;
  Icon: typeof Sun1;
}[] = [
  { id: "light", label: "Claro", body: "Fundo branco, para o dia.", Icon: Sun1 },
  { id: "dark", label: "Escuro", body: "Fundo quase preto, para a noite.", Icon: Moon },
  {
    id: "system",
    label: "Do sistema",
    body: "Acompanha o claro ou escuro do seu aparelho.",
    Icon: Monitor,
  },
];

/**
 * Tema do workspace. A escolha vale na hora e fica salva neste navegador; o
 * "do sistema" troca sozinho quando o aparelho muda de claro para escuro.
 */
function AppearanceSettings() {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <section aria-labelledby="settings-theme-heading" className="max-w-2xl space-y-4">
      <div>
        <h2 id="settings-theme-heading" className="text-lg font-semibold tracking-tight">
          Tema
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Vale para o workspace inteiro neste navegador.
          {choice === "system" &&
            ` Agora o sistema está no ${resolved === "dark" ? "escuro" : "claro"}.`}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="settings-theme-heading"
        className="grid gap-3 sm:grid-cols-3"
      >
        {THEME_CHOICES.map(({ id, label, body, Icon }) => {
          const on = choice === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(id)}
              className={cn(
                "group flex flex-col overflow-hidden rounded-[16px] border text-left outline-none transition-[border-color,box-shadow,transform] duration-200 ease-clyro focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]",
                on
                  ? "border-brand shadow-[0_0_0_1px_var(--brand)]"
                  : "border-border hover:border-foreground/20",
              )}
            >
              <ThemePreview theme={id} />
              <span className="flex items-start gap-2.5 border-t border-border bg-card p-3">
                <Icon
                  size={18}
                  color="currentColor"
                  variant={on ? "Bold" : "Linear"}
                  className={cn("mt-px shrink-0", on ? "text-brand" : "text-muted-foreground")}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Miniatura do workspace em cada tema. As cores são fixas de propósito: a
 * prévia do claro precisa parecer clara mesmo com o app no escuro.
 */
function ThemePreview({ theme }: { theme: ThemeChoice }) {
  if (theme === "system") {
    return (
      <span aria-hidden="true" className="relative block h-24 overflow-hidden">
        <ThemeSketch dark={false} />
        <span className="absolute inset-0 [clip-path:polygon(62%_0,100%_0,100%_100%,38%_100%)]">
          <ThemeSketch dark />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="relative block h-24 overflow-hidden">
      <ThemeSketch dark={theme === "dark"} />
    </span>
  );
}

function ThemeSketch({ dark }: { dark: boolean }) {
  return (
    <span
      className={cn("absolute inset-0 flex gap-1.5 p-2.5", dark ? "bg-[#0b0b0c]" : "bg-[#f5f5f5]")}
    >
      <span className="flex w-[30%] flex-col gap-1.5 pt-1">
        <span className="h-1.5 w-3/4 rounded-full bg-[#ff6a13]" />
        <span className={cn("h-1.5 w-full rounded-full", dark ? "bg-[#2d2d31]" : "bg-[#e2e2e5]")} />
        <span className={cn("h-1.5 w-5/6 rounded-full", dark ? "bg-[#2d2d31]" : "bg-[#e2e2e5]")} />
      </span>
      <span
        className={cn(
          "flex flex-1 flex-col gap-1.5 rounded-[8px] p-2",
          dark ? "bg-[#161618]" : "bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05)]",
        )}
      >
        <span className={cn("h-2 w-1/2 rounded-full", dark ? "bg-[#ededef]" : "bg-[#0a0a0a]")} />
        <span className={cn("h-1.5 w-5/6 rounded-full", dark ? "bg-[#3a3a3f]" : "bg-[#d4d4d4]")} />
        <span className={cn("h-1.5 w-2/3 rounded-full", dark ? "bg-[#3a3a3f]" : "bg-[#d4d4d4]")} />
        <span className="mt-auto h-3 w-8 self-end rounded-full bg-[#ff6a13]" />
      </span>
    </span>
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
      <SelectTrigger id={id} className={SETTINGS_CONTROL}>
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

type NoiseMode = "strong" | "standard" | "browser" | "off";

const NOISE_MODES: { value: NoiseMode; label: string; body: string }[] = [
  {
    value: "strong",
    label: "Forte",
    body: "Tira teclado, ventilador, TV e vozes ao fundo, mesmo enquanto você fala.",
  },
  {
    value: "standard",
    label: "Leve",
    body: "Filtra menos e deixa a voz com mais agudos. Bom para sala silenciosa.",
  },
  {
    value: "browser",
    label: "Do navegador",
    body: "A redução simples do navegador. Tira só ruído constante, como chiado.",
  },
  {
    value: "off",
    label: "Desligada",
    body: "Sua voz sai sem tratamento. Para microfone bom em sala silenciosa.",
  },
];

/** As três preferências de ruído vistas como uma escolha só, como no Discord. */
function noiseModeOf(settings: MediaSettings): NoiseMode {
  if (settings.voiceFilter) return settings.voiceFilterModel;
  return settings.noiseSuppression ? "browser" : "off";
}

function applyNoiseMode(mode: NoiseMode) {
  if (mode === "strong" || mode === "standard") {
    setMediaSetting("voiceFilterModel", mode);
    setMediaSetting("voiceFilter", true);
    return;
  }
  setMediaSetting("voiceFilter", false);
  setMediaSetting("noiseSuppression", mode === "browser");
}

function NoiseSuppressionSetting() {
  const settings = useMediaSettings();
  const mode = noiseModeOf(settings);
  const current = NOISE_MODES.find((option) => option.value === mode) ?? NOISE_MODES[0];

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <Label htmlFor="noise-mode" className="text-sm font-medium">
          Supressão de ruído
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {current?.body} O processamento acontece no navegador.
        </p>
      </div>
      <Select value={mode} onValueChange={(value) => applyNoiseMode(value as NoiseMode)}>
        <SelectTrigger id="noise-mode" className={cn(SETTINGS_CONTROL, "w-[150px] shrink-0")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NOISE_MODES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
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
  const inputRef = useRef<HTMLInputElement>(null);
  const isAvatar = kind === "avatar";
  const label = isAvatar ? "Foto de perfil" : "Banner";

  return (
    <fieldset
      className="min-w-0 rounded-[16px] border border-border bg-card px-3 pb-3 sm:px-4"
      disabled={busy}
    >
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="mt-1 flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "shrink-0 overflow-hidden border border-border bg-muted",
            isAvatar ? "size-11 rounded-full" : "h-11 w-[72px] rounded-lg",
          )}
        >
          <MediaImage src={value} className="h-full w-full object-cover" />
        </span>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onPick(file);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="rounded-full shadow-none"
          aria-label={isAvatar ? "Enviar foto de perfil" : "Enviar banner"}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} /> {busy ? "Enviando…" : "Enviar imagem"}
        </Button>

        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full text-muted-foreground"
            aria-label={isAvatar ? "Remover foto de perfil" : "Remover banner"}
            onClick={() => onChange("")}
          >
            Remover
          </Button>
        )}
      </div>

      <details className="group mt-2">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown
            size={13}
            className="transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
          Usar link da imagem
        </summary>
        <Input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://…"
          className={cn(SETTINGS_CONTROL, "mt-1 text-xs")}
          aria-label={isAvatar ? "URL do avatar" : "URL do banner"}
        />
      </details>
    </fieldset>
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
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_6px_18px_-12px_rgb(0_0_0/0.22)]">
      <div className="h-24 w-full" style={{ backgroundColor: bannerColor }}>
        <MediaImage src={bannerUrl} className="h-full w-full object-cover" />
      </div>
      <div className="px-4 pb-4">
        <div className="relative -mt-8 mb-2">
          <span className="inline-block rounded-full ring-4 ring-card">
            <UserAvatar profile={preview} size={64} showStatus={false} />
          </span>
        </div>
        <p className="truncate text-sm font-semibold">{displayName || "Seu nome"}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{username}
          {pronouns.trim() ? ` · ${pronouns.trim()}` : ""}
        </p>
        {bio.trim() && <p className="mt-3 whitespace-pre-line break-words text-sm">{bio.trim()}</p>}
      </div>
    </div>
  );
}
