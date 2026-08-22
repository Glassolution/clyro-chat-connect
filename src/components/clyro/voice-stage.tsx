import { useEffect, useRef, useState } from "react";
import {
  Headphones,
  HeadphoneOff,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Signal,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/clyro-types";
import type { RemotePeer } from "@/lib/useVoiceRoom";
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
  cameraOn: boolean;
  connecting: boolean;
  error: string | null;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleScreen: () => void | Promise<void>;
  toggleCamera: () => void | Promise<void>;
};

type StageTile = {
  id: string;
  name: string;
  profile: Profile | undefined;
  speaking: boolean;
  muted: boolean;
  stream: MediaStream | null;
  badge: string | null;
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
    <section className="clyro-fade-in flex min-h-0 flex-1 flex-col bg-stage text-stage-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stage-foreground/10 px-4">
        <Volume2 size={16} />
        <span className="truncate text-sm font-semibold">{title}</span>
        {subtitle && (
          <span className="truncate text-xs text-stage-foreground/50">/ {subtitle}</span>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
        {members.length === 0 ? (
          <>
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-stage-foreground/10">
              <Volume2 size={26} />
            </span>
            <div>
              <h2 className="text-base font-semibold">Ninguém por aqui ainda</h2>
              <p className="mt-1 text-sm text-stage-foreground/60">
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
                  <span className="max-w-24 truncate text-xs text-stage-foreground/70">
                    {member.display_name || member.username}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-stage-foreground/60">
              {members.length} {members.length === 1 ? "pessoa está" : "pessoas estão"} nesta call.
            </p>
          </>
        )}

        {onJoin && (
          <button
            type="button"
            onClick={onJoin}
            className="flex items-center gap-2 rounded-full bg-stage-foreground px-6 py-2.5 text-sm font-medium text-stage transition-transform hover:scale-105 active:scale-95"
          >
            <Volume2 size={16} /> Entrar na chamada
          </button>
        )}
      </div>
    </section>
  );
}

function ConnectedStage({
  title,
  subtitle,
  rtc,
  profiles,
  selfProfile,
  onLeave,
}: {
  title: string;
  subtitle?: string | undefined;
  rtc: VoiceControls;
  profiles: Map<string, Profile> | undefined;
  selfProfile: Profile | undefined;
  onLeave: () => void;
}) {
  const localVideo = rtc.screenStream ?? (rtc.cameraOn ? rtc.localStream : null);
  const timer = useCallTimer(!rtc.connecting);
  const total = rtc.peers.length + 1;
  const [pinned, setPinned] = useState<string | null>(null);

  const tiles: StageTile[] = [
    {
      id: "self",
      name: `${selfProfile?.display_name || selfProfile?.username || "Você"} (você)`,
      profile: selfProfile,
      speaking: rtc.localSpeaking && !rtc.muted,
      muted: rtc.muted,
      stream: localVideo,
      badge: rtc.sharingScreen ? "Compartilhando tela" : null,
    },
    ...rtc.peers.map((peer) => {
      const profile = profiles?.get(peer.id);
      return {
        id: peer.id,
        name: profile?.display_name || profile?.username || "Participante",
        profile,
        speaking: peer.speaking,
        muted: false,
        stream: peer.hasVideo ? peer.stream : null,
        badge: null,
      };
    }),
  ];

  // Se quem estava expandido saiu da call, a tela volta sozinha para a grade.
  const expandedId = tiles.some((tile) => tile.id === pinned) ? pinned : null;
  const setExpandedId = setPinned;
  const visibleTiles = expandedId ? tiles.filter((tile) => tile.id === expandedId) : tiles;

  return (
    <section className="clyro-fade-in flex min-h-0 flex-1 flex-col bg-stage text-stage-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stage-foreground/10 px-4">
        <Volume2 size={16} />
        <span className="truncate text-sm font-semibold">{title}</span>
        {subtitle && (
          <span className="truncate text-xs text-stage-foreground/50">/ {subtitle}</span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-stage-foreground/60">
          {rtc.error ? (
            <span className="text-destructive">{rtc.error}</span>
          ) : rtc.connecting ? (
            "Conectando…"
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <Signal size={12} className="text-online" />
                {timer}
              </span>
              <span>
                {total} participante{total > 1 ? "s" : ""}
              </span>
            </>
          )}
        </span>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center",
          expandedId ? "p-3" : "overflow-y-auto clyro-scroll p-6",
        )}
      >
        <div
          className={cn(
            expandedId
              ? "h-full w-full"
              : cn(
                  "grid w-full gap-4",
                  total === 1 ? "max-w-2xl" : "max-w-6xl sm:grid-cols-2",
                  total > 4 && "lg:grid-cols-3",
                ),
          )}
        >
          {visibleTiles.map((tile, index) => (
            <Tile
              key={tile.id}
              name={tile.name}
              profile={tile.profile}
              speaking={tile.speaking}
              muted={tile.muted}
              stream={tile.stream}
              badge={tile.badge}
              index={index}
              expanded={expandedId === tile.id}
              onToggleExpand={() => setExpandedId(expandedId === tile.id ? null : tile.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-stage-foreground/10 p-4">
        <ControlButton
          active={!rtc.muted}
          onClick={rtc.toggleMute}
          label={rtc.muted ? "Ativar microfone" : "Silenciar microfone"}
          animateKey={rtc.muted ? "muted" : "live"}
          animation={rtc.muted ? "clyro-mute" : "clyro-unmute"}
        >
          {rtc.muted ? <MicOff size={18} /> : <Mic size={18} />}
        </ControlButton>
        <ControlButton
          active={!rtc.deafened}
          onClick={rtc.toggleDeafen}
          label={rtc.deafened ? "Ouvir de novo" : "Silenciar tudo"}
        >
          {rtc.deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </ControlButton>
        <ControlButton
          active={rtc.cameraOn}
          onClick={() => void rtc.toggleCamera()}
          label={rtc.cameraOn ? "Desligar câmera" : "Ligar câmera"}
        >
          {rtc.cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </ControlButton>
        <ControlButton
          active={rtc.sharingScreen}
          onClick={() => void rtc.toggleScreen()}
          label={rtc.sharingScreen ? "Parar de compartilhar" : "Compartilhar tela"}
        >
          {rtc.sharingScreen ? <MonitorX size={18} /> : <MonitorUp size={18} />}
        </ControlButton>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Sair da chamada"
          title="Sair da chamada"
          className="ml-2 flex h-11 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform hover:scale-105 active:scale-95"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </section>
  );
}

function Tile({
  name,
  profile,
  speaking,
  muted,
  stream,
  badge,
  index,
  expanded,
  onToggleExpand,
}: {
  name: string;
  profile: Profile | undefined;
  speaking: boolean;
  muted: boolean;
  stream: MediaStream | null;
  badge: string | null;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggleExpand}
      title={expanded ? "Voltar para a grade" : "Expandir"}
      aria-pressed={expanded}
      className={cn(
        "clyro-enter group relative flex items-center justify-center overflow-hidden rounded-2xl bg-stage-foreground/5 ring-1 ring-stage-foreground/10 transition-shadow",
        // Expandido ocupa toda a área até a barra de controles, que fica fora daqui.
        expanded ? "h-full w-full" : "aspect-video",
        speaking && "speaking-pulse",
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {stream ? (
        <StreamVideo stream={stream} className="h-full w-full bg-black object-contain" />
      ) : (
        <UserAvatar profile={profile} size={expanded ? 112 : 72} showStatus={false} />
      )}

      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm">
        {muted && <MicOff size={11} />}
        {name}
        {badge ? ` · ${badge}` : ""}
      </span>

      <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
        {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </span>
    </button>
  );
}

function ControlButton({
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
      // Trocar a key remonta o botão, o que faz a animação tocar a cada mudança.
      key={animateKey}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-stage-foreground text-stage hover:bg-stage-foreground/90"
          : "bg-stage-foreground/10 text-stage-foreground hover:bg-stage-foreground/20",
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
    <div className="clyro-fade-in border-t border-border bg-rail px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
          title="Abrir a tela da chamada"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-online">
            <Signal size={12} />
            {rtc.connecting ? "Conectando…" : `Voz conectada · ${timer}`}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {title}
            {subtitle ? ` / ${subtitle}` : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Sair da chamada"
          title="Sair da chamada"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <PhoneOff size={15} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <DockButton
          active={!rtc.muted}
          onClick={rtc.toggleMute}
          label={rtc.muted ? "Ativar microfone" : "Silenciar microfone"}
          animateKey={rtc.muted ? "muted" : "live"}
          animation={rtc.muted ? "clyro-mute" : "clyro-unmute"}
        >
          {rtc.muted ? <MicOff size={15} /> : <Mic size={15} />}
        </DockButton>
        <DockButton
          active={rtc.sharingScreen}
          onClick={() => void rtc.toggleScreen()}
          label={rtc.sharingScreen ? "Parar de compartilhar" : "Compartilhar tela"}
        >
          {rtc.sharingScreen ? <MonitorX size={15} /> : <MonitorUp size={15} />}
        </DockButton>
        <DockButton
          active={rtc.cameraOn}
          onClick={() => void rtc.toggleCamera()}
          label={rtc.cameraOn ? "Desligar câmera" : "Ligar câmera"}
        >
          {rtc.cameraOn ? <Video size={15} /> : <VideoOff size={15} />}
        </DockButton>
      </div>
    </div>
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
