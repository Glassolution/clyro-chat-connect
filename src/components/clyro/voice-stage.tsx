import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Hand,
  Headphones,
  LayoutGrid,
  Maximize2,
  Minimize2,
  HeadphoneOff,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Pin,
  Sparkles,
  Video,
  UserPlus,
  Users,
  VideoOff,
  Volume2,
  X,
} from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SCREEN_VOLUME_DEFAULT,
  SCREEN_VOLUME_MAX,
  setScreenVolume,
  useScreenVolume,
} from "@/lib/screen-volume";
import {
  canShareScreen,
  setMediaSetting,
  useMediaSettings,
  SCREEN_FPS,
  SCREEN_RESOLUTIONS,
  type ScreenFps,
  type ScreenResolution,
  type ShareOptions,
  type ShareSurface,
} from "@/lib/media-settings";
import type { Profile } from "@/lib/clyro-types";
import type { LinkQuality, RemotePeer } from "@/lib/useVoiceRoom";
import { UserAvatar } from "./primitives";
import { StreamVideo } from "./media";

export type VoiceControls = {
  peers: RemotePeer[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  localSpeaking: boolean;
  muted: boolean;
  deafened: boolean;
  sharingScreen: boolean;
  /** Ids dos participantes transmitindo a tela agora. */
  sharingPeers: string[];
  cameraOn: boolean;
  connecting: boolean;
  error: string | null;
  quality: LinkQuality;
  /** Ids de usuário com a mão levantada. */
  raisedHands: string[];
  handRaised: boolean;
  reactions: { id: string; userId: string; emoji: string }[];
  toggleHand: () => void;
  sendReaction: (emoji: string) => void;
  hasTurnRelay: boolean;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleScreen: (options?: ShareOptions) => void | Promise<void>;
  toggleCamera: () => void | Promise<void>;
  /** As faixas da voz de quem fala mais alto, para o medidor (ver useVoiceRoom). */
  readVoiceBands?: (out: number[]) => number;
};

type StageTile = {
  id: string;
  userId: string | null;
  name: string;
  self: boolean;
  profile: Profile | undefined;
  speaking: boolean;
  muted: boolean;
  stream: MediaStream | null;
  badge: string | null;
  sharing: boolean;
  hand?: boolean;
  reaction?: string | null;
};

/** Tempo desde que a chamada começou, no formato h:mm:ss. */
function useCallTimer(active: boolean) {
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    const id = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function VoiceStage({
  title,
  subtitle,
  rtc,
  profiles,
  selfProfile,
  onLeave,
  connected = true,
  members = [],
  onJoin,
  chat,
  onBack,
  hostId,
  onInvite,
}: {
  title: string;
  subtitle?: string | undefined;
  rtc: VoiceControls;
  profiles: Map<string, Profile> | undefined;
  selfProfile: Profile | undefined;
  onLeave: () => void;
  /** Falso quando você está vendo o canal sem estar na chamada. */
  connected?: boolean;
  members?: Profile[];
  onJoin?: (() => void) | undefined;
  /** A conversa da sala, num card ao lado da call. */
  chat?: ReactNode;
  /** A seta do cabeçalho, de volta para a lista de salas. */
  onBack?: (() => void) | undefined;
  /** Quem criou a sala, marcado na lista de participantes. */
  hostId?: string | null | undefined;
  /** Copia o link da sala para chamar alguém. */
  onInvite?: (() => void) | undefined;
}) {
  if (!connected) {
    return <VoiceLobby title={title} subtitle={subtitle} members={members} onJoin={onJoin} />;
  }

  return (
    <ConnectedStage
      title={title}
      subtitle={subtitle}
      rtc={rtc}
      profiles={profiles}
      selfProfile={selfProfile}
      onLeave={onLeave}
      chat={chat}
      onBack={onBack}
      hostId={hostId}
      onInvite={onInvite}
    />
  );
}

/** Canal de voz visto de fora: quem está lá dentro e o convite para entrar. */
function VoiceLobby({
  title,
  subtitle,
  members,
  onJoin,
}: {
  title: string;
  subtitle?: string | undefined;
  members: Profile[];
  onJoin?: (() => void) | undefined;
}) {
  return (
    <section className="clyro-fade-in flex min-h-0 flex-1 flex-col bg-card text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/[0.06] px-4">
        <Volume2 size={16} />
        <span className="truncate text-sm font-semibold">{title}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">/ {subtitle}</span>}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
        {members.length === 0 ? (
          <>
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary">
              <Volume2 size={26} />
            </span>
            <div>
              <h2 className="text-base font-semibold">Ninguém por aqui ainda</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Entre e deixe o canal aberto — quem chegar vê você na lista.
              </p>
            </div>
          </>
        ) : (
          <>
            <ul className="flex flex-wrap items-center justify-center gap-3">
              {members.map((member, index) => (
                <li
                  key={member.id}
                  className="clyro-enter flex flex-col items-center gap-2"
                  style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                >
                  <UserAvatar profile={member} size={56} showStatus={false} />
                  <span className="max-w-24 truncate text-xs text-muted-foreground">
                    {member.display_name || member.username}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {members.length} {members.length === 1 ? "pessoa está" : "pessoas estão"} nesta call.
            </p>
          </>
        )}

        {onJoin && (
          <button
            type="button"
            onClick={onJoin}
            className="flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-transform hover:scale-105 active:scale-95"
          >
            <Volume2 size={16} /> Entrar na chamada
          </button>
        )}
      </div>
    </section>
  );
}

/** Quanto da faixa de baixo cabe antes de virar "+N". */
const STRIP_LIMIT = 6;

/**
 * A call por dentro, no desenho da referência: o cabeçalho com o nome da
 * sala, quem está em destaque grande, a faixa com o resto do time e a barra
 * de controles embaixo. À direita, quando a sala tem conversa, os cards de
 * participantes e do chat.
 */
function ConnectedStage({
  title,
  subtitle,
  rtc,
  profiles,
  selfProfile,
  onLeave,
  chat,
  onBack,
  hostId,
  onInvite,
}: {
  title: string;
  subtitle?: string | undefined;
  rtc: VoiceControls;
  profiles: Map<string, Profile> | undefined;
  selfProfile: Profile | undefined;
  onLeave: () => void;
  chat?: ReactNode;
  onBack?: (() => void) | undefined;
  hostId?: string | null | undefined;
  onInvite?: (() => void) | undefined;
}) {
  const localVideo = rtc.screenStream ?? (rtc.cameraOn ? rtc.localStream : null);
  const timer = useCallTimer(!rtc.connecting);
  const total = rtc.peers.length + 1;
  const [pinned, setPinned] = useState<string | null>(null);
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedScreen, setExpandedScreen] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [trayOpen, setTrayOpen] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 2000);
  }, []);

  const hideControls = useCallback(() => {
    clearTimeout(controlsTimer.current);
    setControlsVisible(false);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      setFull(document.fullscreenElement === viewportRef.current);
      revealControls();
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      clearTimeout(controlsTimer.current);
    };
  }, [revealControls]);

  // Quem falou por último fica em destaque, como no Meet; você mesmo não.
  const speakingPeer = rtc.peers.find((peer) => peer.speaking)?.id ?? null;
  useEffect(() => {
    if (speakingPeer) setLastSpeaker(speakingPeer);
  }, [speakingPeer]);

  const selfName = selfProfile?.display_name || selfProfile?.username || "Você";
  const tiles: StageTile[] = [
    {
      id: "self",
      userId: selfProfile?.id ?? null,
      name: selfName,
      self: true,
      profile: selfProfile,
      speaking: rtc.localSpeaking && !rtc.muted,
      muted: rtc.muted,
      stream: localVideo,
      badge: rtc.sharingScreen ? "Compartilhando tela" : null,
      sharing: rtc.sharingScreen,
      hand: rtc.handRaised,
      reaction: rtc.reactions.find((r) => r.userId === selfProfile?.id)?.emoji ?? null,
    },
    ...rtc.peers.map((peer) => {
      const profile = profiles?.get(peer.userId);
      const sharing = rtc.sharingPeers.includes(peer.id);
      return {
        id: peer.id,
        userId: peer.userId,
        name: profile?.display_name || profile?.username || "Participante",
        self: false,
        profile,
        speaking: peer.speaking,
        muted: false,
        stream: peer.hasVideo ? peer.stream : null,
        badge: sharing ? "Compartilhando tela" : null,
        sharing,
        hand: rtc.raisedHands.includes(peer.userId),
        reaction: rtc.reactions.find((r) => r.userId === peer.userId)?.emoji ?? null,
      };
    }),
  ];

  // Quando cada um falou por último: ordena a pílula de áudio, com quem
  // acabou de falar entre as quatro primeiras bolinhas.
  const [spokeAt, setSpokeAt] = useState<Record<string, number>>({});
  const speakingKey = tiles
    .filter((tile) => tile.speaking)
    .map((tile) => tile.id)
    .join(",");
  useEffect(() => {
    if (!speakingKey) return;
    const now = Date.now();
    setSpokeAt((prev) => {
      const next = { ...prev };
      for (const id of speakingKey.split(",")) next[id] = now;
      return next;
    });
  }, [speakingKey]);
  // Ninguém com câmera nem tela: a call vira a pílula com as fotos no centro.
  const audioOnly = tiles.every((tile) => !tile.stream);
  const byRecency = tiles
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => (spokeAt[b.tile.id] ?? -1) - (spokeAt[a.tile.id] ?? -1) || a.index - b.index)
    .map(({ tile }) => tile);

  const byId = (id: string | null) => (id ? tiles.find((tile) => tile.id === id) : undefined);
  // Fixado > tela remota > tela local > quem falou por último > o primeiro a chegar.
  const featured =
    byId(pinned) ??
    tiles.find((tile) => tile.sharing && !tile.self) ??
    tiles.find((tile) => tile.sharing) ??
    byId(lastSpeaker) ??
    tiles[1] ??
    tiles[0]!;
  const isPinned = featured.id === pinned;
  const strip = tiles.filter((tile) => tile.id !== featured.id);
  const visibleStrip = strip.length > STRIP_LIMIT ? strip.slice(0, STRIP_LIMIT - 1) : strip;
  const hidden = strip.length - visibleStrip.length;
  const hasSide = chat !== undefined && chat !== null;
  const screenId = featured.sharing && featured.stream ? featured.id : null;
  const expanded = screenId !== null && screenId === expandedScreen;
  const immersive = expanded || full;
  const showStrip = !immersive && (visibleStrip.length > 0 || onInvite);
  // Ampliada, como no Discord: o resto da call vira uma fileira escura embaixo.
  const hasTray = immersive && tiles.length > 0;
  const menuContainer = full ? viewportRef.current : undefined;

  useEffect(() => {
    setExpandedScreen((current) => (current === screenId ? current : null));
    if (screenId) {
      revealControls();
    } else if (document.fullscreenElement && document.fullscreenElement === viewportRef.current) {
      void document.exitFullscreen().catch(() => {});
    }
    return () => clearTimeout(controlsTimer.current);
  }, [screenId, revealControls]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setExpandedScreen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const expandScreen = () => {
    setSideOpen(false);
    setExpandedScreen(expanded ? null : screenId);
    revealControls();
  };

  const toggleFullscreen = async () => {
    const viewport = viewportRef.current;
    if (!viewport || !screenId) return;
    try {
      if (document.fullscreenElement === viewport) {
        await document.exitFullscreen();
        return;
      }
      if (document.fullscreenEnabled && viewport.requestFullscreen) {
        await viewport.requestFullscreen({ navigationUI: "hide" });
        return;
      }
      const video = viewport.querySelector("video") as
        (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }
    } catch {
      if (!viewport.isConnected) return;
    }
    setSideOpen(false);
    setExpandedScreen(screenId);
    revealControls();
    toast.info("Tela cheia indisponível. A transmissão foi ampliada na chamada.");
  };

  const screenView = screenId
    ? {
        expanded,
        full,
        menuContainer,
        onExpand: expandScreen,
        onFullscreen: () => void toggleFullscreen(),
      }
    : undefined;

  const status = rtc.error ? (
    <span className="text-[#ff8a80]">{rtc.error}</span>
  ) : rtc.connecting ? (
    "Conectando…"
  ) : (
    `${total} ${total === 1 ? "participante" : "participantes"}`
  );

  const participants = (
    <ParticipantsCard
      tiles={tiles}
      hostId={hostId ?? null}
      showAll={showAll}
      onToggleAll={() => setShowAll((open) => !open)}
    />
  );

  return (
    <section className="clyro-fade-in relative flex min-h-0 flex-1 flex-col bg-card text-foreground">
      <header className="flex h-[72px] shrink-0 items-center gap-2 px-2 sm:gap-3 sm:px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para as salas"
            title="Voltar para as salas"
            className="clyro-in-drop flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#525252] transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        {/* Sem nome nem contagem no topo: a call fala por si. Só um erro aparece aqui. */}
        <div className="clyro-in-drop min-w-0 flex-1" style={delay(50)}>
          <h2 className="sr-only">
            {title}
            {subtitle ? ` / ${subtitle}` : ""}, {status}
          </h2>
          {rtc.error && <p className="truncate text-[12.5px] text-[#d93025]">{rtc.error}</p>}
        </div>
        <div className="clyro-in-drop flex shrink-0 items-center gap-1" style={delay(110)}>
          {onInvite && (
            <HeaderButton label="Copiar link da sala" onClick={onInvite}>
              <UserPlus size={18} />
            </HeaderButton>
          )}
          <span className="hidden h-9 items-center px-2 sm:flex">
            <QualityBars quality={rtc.quality} />
          </span>
          {hasSide && (
            <span>
              <HeaderButton
                label={sideOpen ? "Fechar conversa" : "Abrir conversa"}
                onClick={() => {
                  setExpandedScreen(null);
                  setSideOpen((open) => !open);
                }}
                active={sideOpen}
              >
                <MessageSquare size={18} />
              </HeaderButton>
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          ref={viewportRef}
          data-controls={screenId && !controlsVisible ? "hidden" : undefined}
          onPointerMove={screenId ? revealControls : undefined}
          onPointerDown={screenId ? revealControls : undefined}
          onPointerLeave={screenId && immersive ? hideControls : undefined}
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col fullscreen:bg-[#111214]",
            // Ampliada, a transmissão cobre a call inteira, cabeçalho incluído.
            expanded && !full ? "clyro-fade-in absolute inset-0 z-30 bg-[#111214]" : "relative",
          )}
        >
          {audioOnly ? (
            <AudioStage tiles={byRecency} onInvite={onInvite} readBands={rtc.readVoiceBands} />
          ) : (
            <div
              className={cn(
                "clyro-in-rise flex min-h-0 flex-1 flex-col",
                immersive ? "p-0" : "gap-3 p-3 sm:p-4",
              )}
              style={delay(100)}
            >
              <FeaturedTile
                tile={featured}
                pinned={isPinned}
                screenView={screenView}
                onTogglePin={() => setPinned(isPinned ? null : featured.id)}
                onStopShare={
                  featured.self && featured.sharing ? () => void rtc.toggleScreen() : undefined
                }
              />

              {showStrip && (
                /* Começa no meio e abre para os lados conforme entra gente; se não
                   couber, rola sem esconder ninguém (centro "seguro"). */
                <div className="clyro-scroll flex h-[92px] shrink-0 items-center justify-center-safe gap-3 overflow-x-auto sm:h-[108px]">
                  {visibleStrip.map((tile, index) => (
                    <StripTile
                      key={tile.id}
                      tile={tile}
                      index={index}
                      onSelect={() => setPinned(tile.id)}
                    />
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAll(true);
                        setSideOpen(true);
                      }}
                      aria-label={`Ver mais ${hidden} participantes`}
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand text-[15px] font-semibold text-white transition-transform hover:scale-105 active:scale-95"
                    >
                      +{hidden}
                    </button>
                  )}
                  {strip.length === 0 && onInvite && (
                    <button
                      type="button"
                      onClick={onInvite}
                      className="flex h-full min-w-[220px] shrink-0 items-center gap-3 rounded-[16px] border border-dashed border-black/15 px-4 text-left transition-colors hover:border-black/25 hover:bg-[#fafafa]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f5f5f6]">
                        <UserPlus size={18} />
                      </span>
                      <span>
                        <span className="block text-[13.5px] font-medium">Chame o time</span>
                        <span className="block text-[12px] text-[#737373]">
                          Copie o link da sala
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              )}

              {hasTray && (
                <div
                  className={cn(
                    "relative shrink-0 transition-[height] duration-300 ease-clyro motion-reduce:transition-none",
                    trayOpen ? "h-[104px]" : "h-0",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setTrayOpen((open) => !open)}
                    aria-label={trayOpen ? "Esconder participantes" : "Mostrar participantes"}
                    aria-expanded={trayOpen}
                    className={cn(
                      "call-screen-controls absolute left-1/2 z-20 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#1e1f22]/90 px-3 text-white shadow-lg outline-none backdrop-blur-md transition-[background-color,opacity] hover:bg-[#2b2d31] focus-visible:ring-2 focus-visible:ring-brand",
                      trayOpen ? "-top-4" : "-top-12",
                    )}
                  >
                    {trayOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    <Users size={16} />
                  </button>
                  <div
                    inert={!trayOpen}
                    className={cn(
                      "clyro-scroll flex h-full items-center justify-center gap-2 overflow-x-auto px-4 transition-opacity duration-200",
                      trayOpen ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {/* Todo mundo da call em bolinhas, como quando as pessoas entram. */}
                    {byRecency.map((tile, index) => (
                      <StripTile
                        key={tile.id}
                        tile={tile}
                        index={index}
                        dark
                        onSelect={() => {
                          if (tile.id === featured.id) return;
                          setExpandedScreen(null);
                          setPinned(tile.id);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            className={cn(
              "flex shrink-0 items-center gap-2 px-3 sm:px-4",
              // Ampliada ou em tela cheia, a barra flutua sobre a transmissão e some
              // sozinha; no modo normal ela fica embaixo, fora da imagem.
              screenId && immersive
                ? cn(
                    "call-screen-controls absolute inset-x-0 z-20 mx-auto w-fit max-w-full rounded-full border border-black/10 bg-card/95 p-2 shadow-lg backdrop-blur-md sm:px-3",
                    hasTray ? (trayOpen ? "bottom-[124px]" : "bottom-16") : "bottom-4",
                  )
                : "h-[72px]",
            )}
          >
            <span
              className={cn(
                "clyro-in-rise hidden items-center gap-2 text-[13px] font-medium tabular-nums text-[#525252] sm:flex",
                screenId && immersive ? "mr-2 pl-2" : "w-[84px]",
              )}
              style={delay(320)}
            >
              <span aria-hidden="true" className="relative flex h-2.5 w-2.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/60 motion-reduce:animate-none" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-brand" />
              </span>
              {rtc.connecting ? "--:--" : timer}
            </span>

            <div className="flex flex-1 items-center justify-center gap-2">
              <span className="clyro-in-rise flex" style={delay(360)}>
                <StageButton
                  on={rtc.cameraOn}
                  onClick={() => void rtc.toggleCamera()}
                  label={rtc.cameraOn ? "Desligar câmera" : "Ligar câmera"}
                >
                  {rtc.cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                </StageButton>
              </span>
              <span className="clyro-in-rise flex" style={delay(410)}>
                <StageButton
                  on={!rtc.muted}
                  onClick={rtc.toggleMute}
                  label={rtc.muted ? "Ativar microfone" : "Silenciar microfone"}
                  animateKey={rtc.muted ? "muted" : "live"}
                  animation={rtc.muted ? "clyro-mute" : "clyro-unmute"}
                >
                  {rtc.muted ? <MicOff size={18} /> : <Mic size={18} />}
                </StageButton>
              </span>
              {/* A qualidade fica colada no botão de compartilhar, onde a pessoa procura. */}
              <span className="clyro-in-rise relative flex items-center" style={delay(460)}>
                {rtc.sharingScreen ? (
                  <>
                    <StageButton
                      on
                      onClick={() => void rtc.toggleScreen()}
                      label="Parar de compartilhar"
                    >
                      <MonitorX size={18} />
                    </StageButton>
                    {/* No ar, a qualidade muda na hora pelo atalho do botão. */}
                    <ScreenQualityMenu portalContainer={menuContainer} />
                  </>
                ) : (
                  <ShareSheet
                    portalContainer={menuContainer}
                    onShare={(options) => void rtc.toggleScreen(options)}
                  />
                )}
              </span>
              <span className="clyro-in-rise flex" style={delay(510)}>
                <MoreMenu rtc={rtc} onInvite={onInvite} portalContainer={menuContainer} />
              </span>
            </div>

            <button
              type="button"
              onClick={onLeave}
              aria-label="Sair da chamada"
              title="Sair da chamada"
              style={delay(560)}
              className={cn(
                "clyro-in-rise flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-destructive text-[13.5px] font-medium text-white transition-[transform,filter] hover:brightness-110 active:scale-95",
                screenId ? "w-10" : "px-3 sm:px-4",
              )}
            >
              <PhoneOff size={17} />
              {!screenId && <span className="hidden sm:inline">Sair da chamada</span>}
            </button>
          </div>
        </div>

        {hasSide && (
          <aside
            className={cn(
              "min-h-0 w-[300px] shrink-0 flex-col border-l border-black/[0.06] xl:w-[320px]",
              sideOpen && !immersive
                ? "clyro-in-slide absolute inset-x-0 bottom-0 top-[72px] z-20 flex w-auto border-l-0 bg-card lg:static lg:w-[300px] lg:border-l"
                : "hidden",
            )}
          >
            {participants}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-black/[0.06]">
              <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-2">
                <span className="text-[14px] font-semibold">Conversa</span>
                {sideOpen && (
                  <button
                    type="button"
                    onClick={() => setSideOpen(false)}
                    aria-label="Fechar o painel"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#737373] transition-colors hover:bg-black/[0.05] hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col">{chat}</div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

/** Quantas fotos cabem na barra antes do "+N". */
const PILL_LIMIT = 4;

/** O atraso de cada peça na entrada, para a call montar em sequência. */
const delay = (ms: number) => ({ ["--d" as string]: `${ms}ms` });

/**
 * Só áudio: a barra redonda no centro com as fotos de quem está na sala, as
 * quatro que falaram por último na frente. Quem fala ganha o brilho verde e
 * vem para o primeiro plano; o resto fica no "+N", que abre a lista. Sozinho
 * na sala, o segundo lugar da barra é o convite.
 *
 * A ordem na tela vem do `order` do CSS, não da ordem no DOM: assim trocar
 * quem está na frente não remonta a foto nem repete a animação de entrada.
 */
function AudioStage({
  tiles,
  onInvite,
  readBands,
}: {
  tiles: StageTile[];
  onInvite?: (() => void) | undefined;
  readBands?: ((out: number[]) => number) | undefined;
}) {
  // Na primeira montagem cada peça entra na sua vez; quem chega depois entra na hora.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  const shown = tiles.slice(0, PILL_LIMIT);
  const stable = [...shown].sort((a, b) => a.id.localeCompare(b.id));
  const rest = tiles.slice(PILL_LIMIT);
  const speaking = tiles.filter((tile) => tile.speaking);
  const live = speaking.length > 0;
  const alone = tiles.length === 1;
  const names = speaking.map((tile) => (tile.self ? "Você" : tile.name.split(" ")[0]));
  const who =
    names.length > 2
      ? `${names.slice(0, 2).join(", ")} e mais ${names.length - 2}`
      : names.join(" e ");
  const caption = live
    ? `${who} ${names.length > 1 ? "estão" : "está"} falando`
    : alone
      ? "Só você por aqui"
      : `${tiles.length} pessoas na sala`;
  const avatarSize = "h-12 w-12 sm:h-16 sm:w-16";
  const after = 200 + shown.length * 70;

  return (
    <div className="flex min-h-[240px] flex-1 items-center justify-center px-4">
      {/*
        O conjunto inteiro (selo, barra e legenda) é que fica no centro. O recuo
        à esquerda e no topo é o tanto que o selo sai da barra, então o olho lê
        o grupo como um bloco só, sem pender para cima e para a esquerda.
      */}
      <div className="flex flex-col items-center pl-3 pt-3 sm:pl-3.5 sm:pt-3.5">
        <div className="relative">
          <span
            aria-hidden="true"
            className="clyro-in-badge absolute -left-3 -top-3 z-30 flex h-9 w-9 items-center justify-center gap-[2.5px] rounded-full bg-[#1c1c1c] shadow-[0_4px_12px_-4px_rgb(0_0_0/0.35)] sm:-left-3.5 sm:-top-3.5 sm:h-11 sm:w-11"
            style={delay(after + 60)}
          >
            <VoiceMeter read={readBands} live={live} />
          </span>

          <div
            className="clyro-in-pill flex items-center rounded-full border border-black/[0.06] bg-white p-[5px] shadow-[0_12px_30px_-12px_rgb(0_0_0/0.2)]"
            style={delay(80)}
          >
            {stable.map((tile) => {
              const rank = shown.indexOf(tile);
              return (
                <span
                  key={tile.id}
                  title={tile.self ? `${tile.name} (você)` : tile.name}
                  className={cn(
                    "clyro-in-pop relative shrink-0 rounded-full ring-[2.5px] ring-white transition-[scale,margin] duration-300 ease-clyro",
                    avatarSize,
                    rank > 0 && "-ml-2.5",
                    tile.speaking && "scale-[1.05]",
                  )}
                  style={{
                    order: rank,
                    zIndex: tile.speaking ? 20 : PILL_LIMIT - rank,
                    ...delay(intro ? 200 + rank * 70 : 0),
                  }}
                >
                  <UserAvatar
                    profile={tile.profile}
                    size={64}
                    showStatus={false}
                    className="!h-full !w-full"
                  />
                  <span
                    aria-hidden="true"
                    data-speaking={tile.speaking}
                    className="speaking-halo pointer-events-none absolute inset-0 rounded-full"
                  />
                  {(tile.hand || tile.muted) && (
                    <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] shadow-[0_1px_3px_rgb(0_0_0/0.15)]">
                      {tile.hand ? "✋" : <MicOff size={10} className="text-[#737373]" />}
                    </span>
                  )}
                  {tile.reaction && (
                    <span className="clyro-pop-in pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 text-2xl">
                      {tile.reaction}
                    </span>
                  )}
                </span>
              );
            })}

            {alone && onInvite && (
              <button
                type="button"
                onClick={onInvite}
                aria-label="Copiar link da sala para chamar alguém"
                title="Copiar link da sala"
                className={cn(
                  "clyro-in-pop order-last ml-1 flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-black/15 text-[#a3a3a3] transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-[#c2410c]",
                  avatarSize,
                )}
                style={delay(after)}
              >
                <UserPlus size={20} />
              </button>
            )}

            {rest.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Ver mais ${rest.length} pessoas`}
                    className={cn(
                      "clyro-in-pop order-last ml-0.5 flex h-12 items-center gap-0.5 rounded-full pl-3 pr-3.5 text-[17px] tabular-nums text-[#8a8a8a] transition-colors hover:bg-[#f5f5f5] hover:text-[#525252] data-[state=open]:bg-[#f5f5f5] sm:h-16 sm:text-[20px]",
                      rest.some((tile) => tile.speaking) && "text-[#15803d]",
                    )}
                    style={delay(intro ? after : 0)}
                  >
                    +{rest.length}
                    <ChevronDown size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="clyro-scroll max-h-72 w-60 overflow-y-auto rounded-[16px] p-1.5"
                >
                  {rest.map((tile) => (
                    <div
                      key={tile.id}
                      className="flex h-10 items-center gap-2.5 rounded-[10px] px-2"
                    >
                      <UserAvatar
                        profile={tile.profile}
                        size={26}
                        speaking={tile.speaking}
                        showStatus={false}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        {tile.self ? `${tile.name} (você)` : tile.name}
                      </span>
                      {tile.speaking && (
                        <span className="text-[12px] font-medium text-[#15803d]">falando</span>
                      )}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <p
          className="clyro-in-rise mt-4 whitespace-nowrap text-[13.5px] text-[#8a8a8a]"
          style={delay(intro ? after + 140 : 0)}
          aria-live="polite"
        >
          {caption}
        </p>
      </div>
    </div>
  );
}

/** Altura de descanso de cada barra, a forma de onda parada do selo. */
const METER_REST = [0.42, 0.78, 0.6, 0.36];
/** As faixas agudas têm menos energia na fala; o reforço deixa as quatro vivas. */
const METER_BOOST = [1, 1.15, 1.45, 1.9];

/**
 * As quatro barras do selo seguem a voz de quem está falando: cada uma é uma
 * faixa da fala (do grave ao agudo) e sobe com o volume. O desenho vai direto
 * no estilo, um quadro por vez, sem passar pelo React. Em silêncio as barras
 * voltam à forma de onda parada; com menos movimento pedido, ficam paradas.
 */
function VoiceMeter({
  read,
  live,
}: {
  read?: ((out: number[]) => number) | undefined;
  live: boolean;
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!read) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bands = [0, 0, 0, 0];
    const shown = METER_REST.map((rest) => rest * 0.7);
    let frame = 0;
    const tick = () => {
      read(bands);
      for (let i = 0; i < 4; i += 1) {
        const rest = (METER_REST[i] ?? 0.5) * 0.7;
        const voice = Math.min(1, (bands[i] ?? 0) * (METER_BOOST[i] ?? 1));
        const target = rest + voice * (1 - rest);
        const current = shown[i] ?? rest;
        // Sobe rápido com a sílaba e desce devagar, como um medidor de verdade.
        shown[i] = current + (target - current) * (target > current ? 0.55 : 0.16);
        const bar = barsRef.current[i];
        if (bar) bar.style.transform = `scaleY(${(shown[i] ?? rest).toFixed(3)})`;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [read]);

  return (
    <>
      {METER_REST.map((rest, index) => (
        <span
          key={index}
          ref={(node) => {
            barsRef.current[index] = node;
          }}
          className={cn(
            "h-4 w-[2.5px] origin-center rounded-full bg-white sm:h-[18px]",
            // Sem o medidor (fora da call), a onda genérica ainda marca quem fala.
            !read && live && "clyro-eq",
          )}
          style={{
            transform: `scaleY(${rest * 0.7})`,
            ["--d" as string]: `${index * 140}ms`,
          }}
        />
      ))}
    </>
  );
}

function HeaderButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-black/[0.07] text-foreground"
          : "text-[#525252] hover:bg-black/[0.05] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type ScreenView = {
  expanded: boolean;
  full: boolean;
  /** Em tela cheia, menus precisam abrir dentro dela para aparecer. */
  menuContainer?: HTMLElement | null | undefined;
  onExpand: () => void;
  onFullscreen: () => void;
};

/** Quem está em destaque: grande, com o nome no canto e o alfinete para fixar. */
function FeaturedTile({
  tile,
  pinned,
  onTogglePin,
  onStopShare,
  screenView,
}: {
  tile: StageTile;
  pinned: boolean;
  onTogglePin: () => void;
  onStopShare?: (() => void) | undefined;
  screenView?: ScreenView | undefined;
}) {
  if (screenView) {
    return (
      <ScreenTile
        key={tile.id}
        tile={tile}
        pinned={pinned}
        onTogglePin={onTogglePin}
        onStopShare={onStopShare}
        view={screenView}
      />
    );
  }
  return (
    <div
      key={tile.id}
      className="clyro-fade-in relative flex min-h-[180px] flex-1 items-center justify-center overflow-hidden rounded-[18px] bg-[#f5f5f6]"
    >
      <span
        aria-hidden="true"
        data-speaking={tile.speaking}
        className="speaking-halo pointer-events-none absolute inset-0 z-10"
      />
      {tile.stream ? (
        <StreamVideo
          stream={tile.stream}
          className={cn("h-full w-full bg-black", tile.sharing ? "object-contain" : "object-cover")}
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <UserAvatar
            profile={tile.profile}
            size={104}
            speaking={tile.speaking}
            showStatus={false}
          />
          {tile.muted && (
            <span className="flex items-center gap-1.5 text-[12.5px] text-[#737373]">
              <MicOff size={13} /> Microfone desligado
            </span>
          )}
        </div>
      )}

      <span
        className={cn(
          "absolute left-3 top-3 z-10 flex h-8 max-w-[70%] items-center gap-2 rounded-full pl-1 pr-3 text-[12.5px] font-medium",
          tile.stream
            ? "bg-black/45 text-white backdrop-blur-md"
            : "border border-black/[0.06] bg-white text-foreground",
        )}
      >
        <UserAvatar profile={tile.profile} size={24} showStatus={false} />
        <span className="truncate">
          {tile.self ? `${tile.name} (você)` : tile.name}
          {tile.badge ? ` · ${tile.badge}` : ""}
        </span>
      </span>

      <button
        type="button"
        onClick={onTogglePin}
        aria-label={pinned ? "Soltar destaque" : "Fixar em destaque"}
        title={pinned ? "Soltar destaque" : "Fixar em destaque"}
        className={cn(
          "absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition-colors",
          pinned
            ? "bg-brand text-white"
            : "bg-white/90 text-[#525252] shadow-[0_1px_3px_rgb(0_0_0/0.12)] hover:bg-white",
        )}
      >
        <Pin size={16} />
      </button>

      {tile.hand && (
        <span
          title="Mão levantada"
          className="clyro-pop-in absolute bottom-3 left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-idle text-base text-black"
        >
          ✋
        </span>
      )}
      {tile.reaction && (
        <span className="clyro-pop-in pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-6xl">
          {tile.reaction}
        </span>
      )}
    </div>
  );
}

/** A prévia local do monitor começa oculta para evitar a captura recursiva da própria chamada. */
function ScreenTile({
  tile,
  pinned,
  onTogglePin,
  onStopShare,
  view,
}: {
  tile: StageTile;
  pinned: boolean;
  onTogglePin: () => void;
  onStopShare?: (() => void) | undefined;
  view: ScreenView;
}) {
  const [ratio, setRatio] = useState(16 / 9);
  const [preview, setPreview] = useState(false);
  const surface = tile.stream?.getVideoTracks()[0]?.getSettings().displaySurface;
  const mirror = tile.self && (!surface || surface === "monitor");
  const previewHidden = mirror && !preview;
  const immersive = view.expanded || view.full;
  const fullLabel = view.full ? "Sair da tela cheia" : "Ver em tela cheia";
  const expandLabel = view.expanded ? "Voltar à visualização padrão" : "Ampliar transmissão";
  const pinLabel = pinned ? "Soltar destaque" : "Fixar em destaque";
  const toggleFullscreen = () => {
    if (previewHidden) setPreview(true);
    view.onFullscreen();
  };
  // Um clique amplia (ou volta); dois cliques vão para a tela cheia.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(clickTimer.current), []);
  const onStreamClick = () => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      if (!view.full) view.onExpand();
    }, 220);
  };
  const onStreamDoubleClick = () => {
    clearTimeout(clickTimer.current);
    toggleFullscreen();
  };

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center [container-type:size]">
      <ScreenVolumeMenu
        userId={tile.self ? null : tile.userId}
        name={tile.name}
        container={view.menuContainer}
      >
        <div
          className={cn(
            "clyro-fade-in relative overflow-hidden",
            immersive || previewHidden ? "h-full w-full" : "max-h-full",
            !immersive && "rounded-[18px]",
            previewHidden ? "bg-[#f5f5f6]" : immersive ? "bg-transparent" : "bg-black",
          )}
          style={
            !immersive && !previewHidden
              ? { aspectRatio: ratio, width: `min(100cqw, calc(100cqh * ${ratio}))` }
              : undefined
          }
        >
          {previewHidden ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-12 text-center">
              <span className="clyro-in-pop hidden size-12 shrink-0 place-items-center rounded-full bg-white text-foreground shadow-sm sm:grid">
                <MonitorUp size={22} />
              </span>
              <div>
                <p className="text-base font-medium">Você está apresentando a tela inteira</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A prévia fica oculta para evitar o efeito espelho.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(true)}
                  className="h-9 rounded-full border border-black/10 bg-white px-3.5 text-[13px] font-medium transition-colors hover:bg-muted"
                >
                  Ver prévia
                </button>
                {onStopShare && (
                  <button
                    type="button"
                    onClick={onStopShare}
                    className="flex h-9 items-center gap-1.5 rounded-full bg-destructive px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-destructive/90"
                  >
                    <MonitorX size={15} />
                    Parar de apresentar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label={view.expanded ? "Voltar à visualização padrão" : "Ampliar transmissão"}
              title={view.expanded ? undefined : "Clique para ampliar"}
              onClick={onStreamClick}
              onDoubleClick={onStreamDoubleClick}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  view.onExpand();
                }
              }}
              className={cn(
                "h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                view.expanded ? "cursor-default" : "cursor-zoom-in",
              )}
            >
              <StreamVideo stream={tile.stream} onAspect={setRatio} />
            </div>
          )}
          <span
            aria-hidden="true"
            data-speaking={tile.speaking}
            className="speaking-halo pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
          />

          {/* Ampliada, o nome fica embaixo à esquerda, sempre à vista, como no Discord. */}
          {immersive && !previewHidden && (
            <span className="pointer-events-none absolute bottom-3 left-3 z-20 flex h-8 max-w-[60%] items-center gap-2 rounded-[8px] bg-black/60 px-2.5 text-[13px] font-medium text-white backdrop-blur-sm">
              <MonitorUp size={15} />
              <span className="truncate">{tile.self ? `${tile.name} (você)` : tile.name}</span>
            </span>
          )}

          {/* Nome e controles presos aos cantos da própria imagem, não da área toda. */}
          <div className="call-screen-controls absolute inset-x-2 top-2 z-20 flex items-center justify-between gap-2 sm:inset-x-3 sm:top-3">
            {immersive ? (
              <span />
            ) : (
              <span className="flex h-8 min-w-0 items-center gap-2 rounded-full bg-black/70 py-1 pl-1 pr-2.5 text-xs font-medium text-white backdrop-blur-md">
                <UserAvatar profile={tile.profile} size={24} showStatus={false} />
                <span className="truncate">{tile.self ? `${tile.name} (você)` : tile.name}</span>
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-black/75 p-1 text-white shadow-sm backdrop-blur-md">
              {mirror && preview && (
                <button
                  type="button"
                  onClick={() => setPreview(false)}
                  className="h-8 rounded-full px-2 text-xs font-medium transition-colors hover:bg-white/20"
                >
                  Ocultar prévia
                </button>
              )}
              {!immersive && (
                <ScreenViewButton label={pinLabel} onClick={onTogglePin} active={pinned}>
                  <Pin size={16} />
                </ScreenViewButton>
              )}
              {!view.full && (
                <ScreenViewButton label={expandLabel} onClick={view.onExpand}>
                  {view.expanded ? <LayoutGrid size={17} /> : <MonitorUp size={17} />}
                </ScreenViewButton>
              )}
              <ScreenViewButton label={fullLabel} onClick={toggleFullscreen}>
                {view.full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </ScreenViewButton>
            </div>
          </div>
        </div>
      </ScreenVolumeMenu>

      {tile.reaction && (
        <span className="clyro-pop-in pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-6xl">
          {tile.reaction}
        </span>
      )}
    </div>
  );
}

/**
 * Botão direito na tela de alguém: volume do som que essa pessoa transmite,
 * de 0 a 200%. Mexe só no que você ouve, e fica lembrado para a próxima call.
 * Na sua própria tela não há o que ajustar — o menu do navegador segue normal.
 */
function ScreenVolumeMenu({
  userId,
  name,
  container,
  children,
}: {
  userId: string | null;
  name: string;
  container?: HTMLElement | null | undefined;
  children: ReactNode;
}) {
  const volume = useScreenVolume(userId);
  if (!userId) return <>{children}</>;
  const muted = volume === 0;
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal container={container ?? undefined}>
        <ContextMenuPrimitive.Content
          collisionPadding={12}
          className="z-50 w-[264px] rounded-[16px] border border-black/[0.06] bg-white p-1.5 text-foreground shadow-[0_24px_60px_-20px_rgb(0_0_0/0.28)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="px-2.5 pb-3 pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[13px] font-medium">Volume da transmissão</p>
              <span className="shrink-0 text-[12.5px] tabular-nums text-[#737373]">{volume}%</span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-[#8a8a8a]">Som da tela de {name}</p>
            {/* As setas mexem no volume, não navegam pelo menu. */}
            <div className="mt-3.5" onKeyDown={(event) => event.stopPropagation()}>
              <Slider
                min={0}
                max={SCREEN_VOLUME_MAX}
                step={1}
                value={[volume]}
                onValueChange={([next]) => setScreenVolume(userId, next ?? SCREEN_VOLUME_DEFAULT)}
                aria-label={`Volume da transmissão de ${name}`}
              />
              <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#a3a3a3]">
                <span>0%</span>
                <span>100%</span>
                <span>200%</span>
              </div>
            </div>
          </div>
          <div className="my-1 h-px bg-black/[0.06]" />
          <ContextMenuPrimitive.Item
            onSelect={(event) => {
              event.preventDefault();
              setScreenVolume(userId, muted ? SCREEN_VOLUME_DEFAULT : 0);
            }}
            className="flex h-9 cursor-default select-none items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] outline-none data-[highlighted]:bg-[#f4f4f5]"
          >
            {muted ? <Volume2 size={16} /> : <HeadphoneOff size={16} />}
            {muted ? "Ativar som da transmissão" : "Silenciar transmissão"}
          </ContextMenuPrimitive.Item>
          <ContextMenuPrimitive.Item
            disabled={volume === SCREEN_VOLUME_DEFAULT}
            onSelect={(event) => {
              event.preventDefault();
              setScreenVolume(userId, SCREEN_VOLUME_DEFAULT);
            }}
            className="flex h-9 cursor-default select-none items-center rounded-[10px] px-2.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-[#f4f4f5]"
          >
            Voltar para 100%
          </ContextMenuPrimitive.Item>
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

function ScreenViewButton({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-full transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white",
        active && "bg-brand",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Na faixa de baixo, quem está com vídeo aparece num quadro e quem está só no
 * áudio vira uma bolinha com a foto. Clicar põe a pessoa em destaque.
 */
function StripTile({
  tile,
  index,
  onSelect,
  dark = false,
}: {
  tile: StageTile;
  index: number;
  onSelect: () => void;
  /** Na fileira escura da transmissão ampliada: bolinhas sobre o fundo escuro. */
  dark?: boolean;
}) {
  const label = tile.self ? "Você" : tile.name;
  const style = { animationDelay: `${Math.min(index, 8) * 45}ms` };

  if (dark) {
    // A câmera de quem ligou aparece dentro da bolinha; quem transmite a tela
    // aparece pela foto, com o selo de ao vivo.
    const camera = tile.stream && !tile.sharing;
    return (
      <button
        type="button"
        onClick={onSelect}
        title={label}
        aria-label={tile.sharing ? `${label}, transmitindo` : `Pôr ${label} em destaque`}
        className="clyro-enter relative shrink-0 rounded-full outline-none transition-transform duration-200 ease-clyro hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand active:scale-95"
        style={style}
      >
        {camera ? (
          <span
            className={cn(
              "block h-16 w-16 overflow-hidden rounded-full bg-black",
              tile.speaking && "speaking-ring",
            )}
          >
            <StreamVideo stream={tile.stream} className="h-full w-full object-cover" />
          </span>
        ) : (
          <UserAvatar
            profile={tile.profile}
            size={64}
            speaking={tile.speaking}
            showStatus={false}
          />
        )}
        {tile.sharing && (
          <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[#da373c] px-1 text-[9px] font-bold uppercase leading-[14px] tracking-wide text-white ring-2 ring-[#111214]">
            Ao vivo
          </span>
        )}
        {(tile.hand || tile.muted) && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] shadow-sm ring-2 ring-[#111214]">
            {tile.hand ? "✋" : <MicOff size={12} className="text-[#737373]" />}
          </span>
        )}
      </button>
    );
  }

  if (!tile.stream) {
    return (
      <button
        type="button"
        onClick={onSelect}
        title={`${label} · pôr em destaque`}
        aria-label={`Pôr ${label} em destaque`}
        className="clyro-enter relative shrink-0 rounded-full transition-transform hover:scale-105 active:scale-95"
        style={style}
      >
        <UserAvatar profile={tile.profile} size={64} speaking={tile.speaking} showStatus={false} />
        {(tile.hand || tile.muted) && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] shadow-sm ring-2 ring-white">
            {tile.hand ? "✋" : <MicOff size={12} className="text-[#737373]" />}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Pôr ${label} em destaque`}
      className="clyro-enter group relative h-full w-[132px] shrink-0 overflow-hidden rounded-[16px] bg-[#f5f5f6] sm:w-[160px]"
      style={style}
    >
      <span
        aria-hidden="true"
        data-speaking={tile.speaking}
        className="speaking-halo pointer-events-none absolute inset-0 z-10"
      />
      <StreamVideo
        stream={tile.stream}
        className="h-full w-full bg-black object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
      <span className="absolute left-2 top-2 z-10 flex h-6 max-w-[85%] items-center gap-1.5 rounded-full bg-black/45 pl-0.5 pr-2 text-[11.5px] font-medium text-white backdrop-blur-md">
        <UserAvatar profile={tile.profile} size={20} showStatus={false} />
        <span className="truncate">{label}</span>
      </span>
      <span
        className={cn(
          "absolute bottom-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md",
          tile.speaking ? "bg-online/90 text-white" : "bg-black/45 text-white/80",
        )}
      >
        {tile.muted ? <MicOff size={13} /> : <Mic size={13} />}
      </span>
    </button>
  );
}

/** Quem está na call: os quatro primeiros e o resto num "ver todos". */
function ParticipantsCard({
  tiles,
  hostId,
  showAll,
  onToggleAll,
}: {
  tiles: StageTile[];
  hostId: string | null;
  showAll: boolean;
  onToggleAll: () => void;
}) {
  const shown = showAll ? tiles : tiles.slice(0, 4);
  const rest = tiles.length - 4;

  return (
    <div className="shrink-0 px-4 pb-2 pt-3.5">
      <p className="mb-2 text-[14px] font-semibold">Participantes</p>
      <ul className={cn("flex flex-col", showAll && "clyro-scroll max-h-56 overflow-y-auto")}>
        {shown.map((tile) => {
          const host = !!hostId && tile.userId === hostId;
          return (
            <li key={tile.id} className="flex h-9 items-center gap-2.5">
              <UserAvatar
                profile={tile.profile}
                size={24}
                speaking={tile.speaking}
                showStatus={false}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85">
                {tile.name}
                {tile.self && <span className="text-[#8a8a8a]"> (você)</span>}
                {host && <span className="text-[#c2410c]"> (criou a sala)</span>}
              </span>
              {tile.hand && <span title="Mão levantada">✋</span>}
              <span
                className={cn(
                  "shrink-0",
                  tile.muted
                    ? "text-[#a3a3a3]"
                    : tile.speaking
                      ? "text-[#15803d]"
                      : "text-[#a3a3a3]",
                )}
                aria-label={tile.muted ? "Microfone desligado" : "Microfone ligado"}
              >
                {tile.muted ? <MicOff size={15} /> : <Mic size={15} />}
              </span>
            </li>
          );
        })}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={onToggleAll}
          className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] text-[12.5px] text-[#737373] transition-colors hover:bg-black/[0.04] hover:text-foreground"
        >
          {showAll
            ? "Mostrar menos"
            : `${rest} ${rest === 1 ? "outro participante" : "outros participantes"}`}
          <ChevronDown
            size={14}
            className={cn("transition-transform duration-200", showAll && "rotate-180")}
          />
        </button>
      )}
    </div>
  );
}

/** Mão, reação, silenciar tudo e o link: o que não precisa de botão próprio. */
function MoreMenu({
  rtc,
  onInvite,
  portalContainer,
}: {
  rtc: VoiceControls;
  onInvite?: (() => void) | undefined;
  portalContainer?: HTMLElement | null | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mais opções"
          title="Mais opções"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f4f5] text-[#525252] transition-colors hover:bg-[#ebebed] data-[state=open]:bg-[#ebebed]"
        >
          <MoreHorizontal size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        portalContainer={portalContainer}
        side="top"
        align="center"
        sideOffset={10}
        className="w-56 rounded-[14px] p-1.5"
      >
        <div className="flex justify-between px-1 pb-1.5 pt-0.5">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => rtc.sendReaction(emoji)}
              aria-label={`Reagir com ${emoji}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 hover:bg-accent"
            >
              {emoji}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={rtc.toggleHand} className="h-9 gap-2.5 rounded-[10px]">
          <Hand size={16} /> {rtc.handRaised ? "Baixar a mão" : "Levantar a mão"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={rtc.toggleDeafen} className="h-9 gap-2.5 rounded-[10px]">
          {rtc.deafened ? <Headphones size={16} /> : <HeadphoneOff size={16} />}
          {rtc.deafened ? "Ouvir de novo" : "Silenciar o som da call"}
        </DropdownMenuItem>
        {onInvite && (
          <DropdownMenuItem onSelect={onInvite} className="h-9 gap-2.5 rounded-[10px]">
            <Copy size={16} /> Copiar link da sala
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const REACTIONS = ["👋", "👍", "😂", "🎉", "🔥"];

/**
 * Resolução e taxa de quadros da transmissão, a um clique do botão de tela.
 * Vale para a próxima transmissão e para a que já estiver no ar.
 */
function ScreenQualityMenu({
  portalContainer,
}: {
  portalContainer?: HTMLElement | null | undefined;
}) {
  const settings = useMediaSettings();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Qualidade da transmissão"
          title="Qualidade da transmissão"
          className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-background ring-2 ring-white transition-transform hover:scale-110"
        >
          <ChevronUp size={11} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        portalContainer={portalContainer}
        side="top"
        align="center"
        className="w-52"
      >
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
          Resolução
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(settings.screenResolution)}
          onValueChange={(value) =>
            setMediaSetting("screenResolution", Number(value) as ScreenResolution)
          }
        >
          {SCREEN_RESOLUTIONS.map((height) => (
            <DropdownMenuRadioItem key={height} value={String(height)}>
              {height}p{height === 2160 ? " · 4K" : height === 1080 ? " · Full HD" : ""}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
          Quadros por segundo
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={String(settings.screenFps)}
          onValueChange={(value) => setMediaSetting("screenFps", Number(value) as ScreenFps)}
        >
          {SCREEN_FPS.map((fps) => (
            <DropdownMenuRadioItem key={fps} value={String(fps)}>
              {fps} fps
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SHARE_SURFACES: { id: ShareSurface; label: string; action: string }[] = [
  { id: "browser", label: "Uma aba", action: "Escolher a aba" },
  { id: "window", label: "Uma janela", action: "Escolher a janela" },
  { id: "monitor", label: "Tela inteira", action: "Escolher a tela" },
];

const SHARE_PRESETS: {
  id: string;
  label: string;
  hint: string;
  resolution: ScreenResolution;
  fps: ScreenFps;
}[] = [
  { id: "sharp", label: "Nítida", hint: "texto, código e slides", resolution: 1440, fps: 15 },
  {
    id: "balanced",
    label: "Equilibrada",
    hint: "serve para quase tudo",
    resolution: 1080,
    fps: 30,
  },
  { id: "smooth", label: "Fluida", hint: "vídeo, animação e jogo", resolution: 1080, fps: 60 },
];

const SHARE_SURFACE_KEY = "clyro.share.surface";

function readSurface(): ShareSurface {
  try {
    const saved = window.localStorage.getItem(SHARE_SURFACE_KEY);
    if (saved === "browser" || saved === "window" || saved === "monitor") return saved;
  } catch {
    /* sem armazenamento: fica no padrão */
  }
  return "browser";
}

/**
 * O painel antes do seletor do navegador. O seletor do Chrome não aceita
 * estilo, então a escolha acontece aqui, no visual da chamada: o que mostrar,
 * em que qualidade e com ou sem som. O botão final abre o seletor já na aba
 * certa, sem a aba do Clyro na lista.
 */
function ShareSheet({
  onShare,
  portalContainer,
}: {
  onShare: (options: ShareOptions) => void;
  portalContainer?: HTMLElement | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<ShareSurface>("browser");
  const [audio, setAudio] = useState(true);
  const settings = useMediaSettings();
  const supported = canShareScreen();

  useEffect(() => {
    if (open) setSurface(readSurface());
  }, [open]);

  const preset = SHARE_PRESETS.find(
    (item) => item.resolution === settings.screenResolution && item.fps === settings.screenFps,
  );
  // Janela não leva som em nenhum navegador; aba leva, tela inteira depende do sistema.
  const audioBlocked = surface === "window";
  const choice = SHARE_SURFACES.find((item) => item.id === surface) ?? SHARE_SURFACES[0];

  const share = () => {
    try {
      window.localStorage.setItem(SHARE_SURFACE_KEY, surface);
    } catch {
      /* sem armazenamento: só não lembra da próxima vez */
    }
    setOpen(false);
    onShare({ surface, audio: audio && !audioBlocked });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Compartilhar tela"
          title="Compartilhar tela"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f4f5] text-[#737373] transition-colors hover:bg-[#ebebed] hover:text-foreground data-[state=open]:bg-[#ebebed] data-[state=open]:text-foreground"
        >
          <MonitorUp size={18} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        portalContainer={portalContainer}
        side="top"
        align="center"
        sideOffset={14}
        collisionPadding={12}
        className="w-[352px] max-w-[calc(100vw-24px)] rounded-[22px] border-black/[0.06] bg-white p-0 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.28)]"
      >
        <div className="px-4 pb-3 pt-4">
          <p className="text-[15px] font-medium tracking-[-0.01em]">Compartilhar tela</p>
          <p className="mt-0.5 text-[12.5px] text-[#8a8a8a]">
            {supported
              ? "Escolha o que o time vai ver."
              : "Este navegador não compartilha tela. Entre pelo computador para mostrar a sua."}
          </p>
        </div>

        {supported && (
          <>
            <div
              role="radiogroup"
              aria-label="O que compartilhar"
              className="grid grid-cols-3 gap-2 px-4"
            >
              {SHARE_SURFACES.map((item) => {
                const on = item.id === surface;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSurface(item.id)}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-[14px] border px-1 pb-2.5 pt-3 transition-[background-color,border-color,box-shadow] duration-200 ease-clyro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                      on
                        ? "border-brand/60 bg-brand-soft/60 shadow-[0_0_0_1px_var(--brand)]"
                        : "border-black/[0.07] hover:border-black/15 hover:bg-[#fafafa]",
                    )}
                  >
                    <SurfaceArt surface={item.id} on={on} />
                    <span
                      className={cn(
                        "text-[12.5px] leading-none",
                        on ? "font-medium text-foreground" : "text-[#525252]",
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 px-4">
              <p className="text-[12px] font-medium text-[#737373]">Qualidade</p>
              <div
                role="radiogroup"
                aria-label="Qualidade da transmissão"
                className="mt-1.5 grid grid-cols-3 gap-1 rounded-full bg-[#f4f4f5] p-1"
              >
                {SHARE_PRESETS.map((item) => {
                  const on = preset?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setMediaSetting("screenResolution", item.resolution);
                        setMediaSetting("screenFps", item.fps);
                      }}
                      className={cn(
                        "h-8 rounded-full text-[12.5px] transition-[background-color,color,box-shadow] duration-200 ease-clyro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                        on
                          ? "bg-white font-medium text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
                          : "text-[#737373] hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12px] tabular-nums text-[#8a8a8a]">
                {settings.screenResolution}p · {settings.screenFps} fps
                {preset ? ` · ${preset.hint}` : " · personalizada"}
              </p>
            </div>

            <label className="mx-4 mt-3 flex items-center gap-3 border-t border-black/[0.06] pt-3">
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[13.5px]",
                    audioBlocked ? "text-[#a3a3a3]" : "text-foreground",
                  )}
                >
                  Levar o som junto
                </span>
                <span className="block text-[12px] text-[#8a8a8a]">
                  {audioBlocked
                    ? "Janela não leva som. Escolha uma aba para o time ouvir."
                    : surface === "browser"
                      ? "O que tocar na aba chega para todo mundo."
                      : "O som do computador, onde o sistema permitir."}
                </span>
              </span>
              <Switch
                checked={audio && !audioBlocked}
                disabled={audioBlocked}
                onCheckedChange={setAudio}
                aria-label="Levar o som junto"
                className="data-[state=checked]:bg-[#15803d]"
              />
            </label>

            <div className="p-4 pt-3.5">
              <button
                type="button"
                onClick={share}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-medium text-background transition-[transform,background-color] duration-150 ease-clyro hover:bg-foreground/90 active:scale-[0.98]"
              >
                <MonitorUp size={17} />
                {choice?.action}
              </button>
              <p className="mt-2 text-center text-[11.5px] text-[#a3a3a3]">
                O navegador confirma. A aba da chamada fica de fora.
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Os desenhos dos três cartões: uma aba, uma janela e um monitor, em miniatura. */
function SurfaceArt({ surface, on }: { surface: ShareSurface; on: boolean }) {
  const accent = on ? "bg-brand" : "bg-[#d4d4d8]";
  const line = on ? "bg-brand/30" : "bg-[#e4e4e7]";

  if (surface === "browser") {
    return (
      <span className="flex h-[46px] w-[68px] flex-col overflow-hidden rounded-[7px] border border-black/[0.08] bg-white shadow-[0_2px_6px_-3px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-clyro group-hover:-translate-y-px">
        <span className="flex h-[11px] items-end gap-[2px] bg-[#efeff1] px-[4px]">
          <span className="h-[7px] w-[22px] rounded-t-[3px] bg-white">
            <span
              className={cn("ml-[3px] mt-[2.5px] block h-[2px] w-[12px] rounded-full", accent)}
            />
          </span>
          <span className="h-[7px] w-[16px] rounded-t-[3px] bg-[#e2e2e5]" />
        </span>
        <span className="flex flex-1 flex-col gap-[3px] px-[6px] pt-[5px]">
          <span className={cn("h-[3px] w-[34px] rounded-full", accent)} />
          <span className={cn("h-[3px] w-[48px] rounded-full", line)} />
          <span className={cn("h-[3px] w-[28px] rounded-full", line)} />
        </span>
      </span>
    );
  }

  if (surface === "window") {
    return (
      <span className="relative h-[46px] w-[68px] transition-transform duration-200 ease-clyro group-hover:-translate-y-px">
        <span className="absolute left-[10px] top-0 h-[34px] w-[54px] rounded-[6px] border border-black/[0.06] bg-[#f4f4f5]" />
        <span className="absolute bottom-0 left-0 flex h-[36px] w-[56px] flex-col overflow-hidden rounded-[6px] border border-black/[0.08] bg-white shadow-[0_2px_6px_-3px_rgb(0_0_0/0.25)]">
          <span className="flex h-[9px] items-center gap-[2px] border-b border-black/[0.05] px-[4px]">
            <span className="h-[3px] w-[3px] rounded-full bg-[#fca5a5]" />
            <span className="h-[3px] w-[3px] rounded-full bg-[#fcd34d]" />
            <span className="h-[3px] w-[3px] rounded-full bg-[#86efac]" />
          </span>
          <span className="flex flex-1 gap-[4px] p-[4px]">
            <span className="w-[12px] rounded-[2px] bg-[#f1f1f3]" />
            <span className="flex flex-1 flex-col gap-[3px] pt-[1px]">
              <span className={cn("h-[3px] w-full rounded-full", accent)} />
              <span className={cn("h-[3px] w-3/4 rounded-full", line)} />
            </span>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="flex h-[46px] w-[68px] flex-col items-center transition-transform duration-200 ease-clyro group-hover:-translate-y-px">
      <span className="flex h-[36px] w-[62px] items-stretch rounded-[5px] border-[2.5px] border-[#3f3f46] bg-white">
        <span className="flex flex-1 flex-col gap-[3px] p-[4px]">
          <span className={cn("h-[3px] w-[26px] rounded-full", accent)} />
          <span className="flex flex-1 gap-[3px]">
            <span className={cn("flex-1 rounded-[2px]", line)} />
            <span className={cn("flex-1 rounded-[2px]", line)} />
          </span>
        </span>
      </span>
      <span className="h-[5px] w-[6px] bg-[#3f3f46]" />
      <span className="h-[2.5px] w-[22px] rounded-full bg-[#3f3f46]" />
    </span>
  );
}

/** Os botões redondos da barra: com o aparelho ligado, o ícone fica verde. */
function StageButton({
  on,
  onClick,
  label,
  animateKey,
  animation,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  animateKey?: string | undefined;
  animation?: string | undefined;
  children: ReactNode;
}) {
  return (
    <button
      // Trocar a key remonta o botão, o que faz a animação tocar a cada mudança.
      key={animateKey}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
        on
          ? "bg-[#f4f4f5] text-[#15803d] hover:bg-[#ebebed]"
          : "bg-[#f4f4f5] text-[#737373] hover:bg-[#ebebed] hover:text-foreground",
        animation,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Barra fixa acima do usuário: mostra que você continua na call mesmo navegando
 * por outros canais, e dá o caminho de volta para a tela da chamada.
 */
export function VoiceDock({
  title,
  subtitle,
  rtc,
  onOpen,
  onLeave,
}: {
  title: string;
  subtitle?: string | undefined;
  rtc: VoiceControls;
  onOpen: () => void;
  onLeave: () => void;
}) {
  const timer = useCallTimer(!rtc.connecting);

  return (
    <div className="clyro-fade-in border-t border-border bg-rail px-2 py-2">
      <div className="rounded-lg bg-card p-2.5">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 text-left"
            title="Abrir a tela da chamada"
          >
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-online">
              <QualityBars quality={rtc.quality} />
              {rtc.connecting ? "Conectando…" : "Voz conectada"}
              {!rtc.connecting && (
                <span className="text-xs font-normal text-muted-foreground">{timer}</span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {title}
              {subtitle ? ` / ${subtitle}` : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={onLeave}
            aria-label="Desligar a chamada"
            title="Desligar a chamada"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-100 hover:bg-destructive hover:text-destructive-foreground"
          >
            <PhoneOff size={17} />
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          <DockButton
            label={rtc.cameraOn ? "Desligar câmera" : "Ligar câmera"}
            active={rtc.cameraOn}
            onClick={() => void rtc.toggleCamera()}
          >
            {rtc.cameraOn ? <Video size={17} /> : <VideoOff size={17} />}
          </DockButton>
          <DockButton
            label={rtc.sharingScreen ? "Parar de compartilhar" : "Compartilhar tela"}
            active={rtc.sharingScreen}
            onClick={() => void rtc.toggleScreen()}
          >
            <MonitorUp size={17} />
          </DockButton>
          <DockButton label="Reação" active={false} onClick={() => rtc.sendReaction("👋")}>
            <Sparkles size={17} />
          </DockButton>
          <DockButton
            label={rtc.handRaised ? "Baixar a mão" : "Levantar a mão"}
            active={rtc.handRaised}
            onClick={rtc.toggleHand}
          >
            <Hand size={17} />
          </DockButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Três barras crescentes, como o indicador de sinal do Discord: a altura já
 * comunica a qualidade sem precisar de texto.
 */
function QualityBars({ quality }: { quality: LinkQuality }) {
  const lit = quality === "good" ? 3 : quality === "fair" ? 2 : quality === "poor" ? 1 : 0;
  const label =
    quality === "good"
      ? "Conexão boa"
      : quality === "fair"
        ? "Conexão instável"
        : quality === "poor"
          ? "Conexão ruim"
          : "Medindo a conexão";

  return (
    <span className="flex items-end gap-[2px]" title={label} aria-label={label} role="img">
      {[5, 8, 11].map((height, index) => (
        <span
          key={height}
          style={{ height }}
          className={cn(
            "w-[3px] rounded-full transition-colors duration-300",
            index < lit
              ? quality === "poor"
                ? "bg-destructive"
                : quality === "fair"
                  ? "bg-idle"
                  : "bg-online"
              : "bg-muted-foreground/30",
          )}
        />
      ))}
    </span>
  );
}

function DockButton({
  active,
  onClick,
  label,
  animateKey,
  animation,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  animateKey?: string | undefined;
  animation?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      key={animateKey}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 flex-1 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-rail-foreground text-rail hover:bg-rail-foreground/90"
          : "bg-rail-foreground/10 text-rail-foreground hover:bg-rail-foreground/20",
        animation,
      )}
    >
      {children}
    </button>
  );
}
