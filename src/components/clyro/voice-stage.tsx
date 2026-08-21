import {
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/clyro-types";
import type { RemotePeer } from "@/lib/useVoiceRoom";
import { UserAvatar } from "./primitives";
import { StreamAudio, StreamVideo } from "./media";

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

export function VoiceStage({
  title,
  rtc,
  profiles,
  selfProfile,
  onLeave,
}: {
  title: string;
  rtc: VoiceControls;
  profiles: Map<string, Profile> | undefined;
  selfProfile: Profile | undefined;
  onLeave: () => void;
}) {
  const localVideo = rtc.screenStream ?? (rtc.cameraOn ? rtc.localStream : null);

  return (
    <div className="flex flex-col border-b border-border bg-stage px-5 py-4 text-stage-foreground">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-stage-foreground/60">
            {rtc.connecting
              ? "Conectando…"
              : `${rtc.peers.length + 1} participante${rtc.peers.length ? "s" : ""}`}
            {rtc.error ? ` · ${rtc.error}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <StageButton active={!rtc.muted} onClick={rtc.toggleMute} label="Microfone">
            {rtc.muted ? <MicOff size={16} /> : <Mic size={16} />}
          </StageButton>
          <StageButton active={!rtc.deafened} onClick={rtc.toggleDeafen} label="Áudio">
            {rtc.deafened ? <HeadphoneOff size={16} /> : <Headphones size={16} />}
          </StageButton>
          <StageButton active={rtc.cameraOn} onClick={() => void rtc.toggleCamera()} label="Câmera">
            {rtc.cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
          </StageButton>
          <StageButton
            active={rtc.sharingScreen}
            onClick={() => void rtc.toggleScreen()}
            label="Compartilhar tela"
          >
            {rtc.sharingScreen ? <MonitorX size={16} /> : <MonitorUp size={16} />}
          </StageButton>
          <Button variant="destructive" size="sm" onClick={onLeave}>
            <PhoneOff size={15} /> Sair
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          name={`${selfProfile?.display_name || selfProfile?.username || "Você"} (você)`}
          profile={selfProfile}
          speaking={rtc.localSpeaking && !rtc.muted}
          stream={localVideo}
          badge={rtc.sharingScreen ? "Compartilhando tela" : null}
        />
        {rtc.peers.map((peer) => {
          const profile = profiles?.get(peer.id);
          return (
            <Tile
              key={peer.id}
              name={profile?.display_name || profile?.username || "Participante"}
              profile={profile}
              speaking={peer.speaking}
              stream={peer.hasVideo ? peer.stream : null}
              badge={null}
            >
              <StreamAudio stream={peer.stream} deafened={rtc.deafened} />
            </Tile>
          );
        })}
      </div>
    </div>
  );
}

function Tile({
  name,
  profile,
  speaking,
  stream,
  badge,
  children,
}: {
  name: string;
  profile: Profile | undefined;
  speaking: boolean;
  stream: MediaStream | null;
  badge: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-stage-foreground/5 ring-1 ring-stage-foreground/10 transition",
        speaking && "ring-2 ring-speaking",
      )}
    >
      {stream ? (
        <StreamVideo stream={stream} className="h-full w-full bg-black object-contain" />
      ) : (
        <UserAvatar profile={profile} size={56} showStatus={false} />
      )}
      {children}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-white">
        {name}
        {badge ? ` · ${badge}` : ""}
      </span>
    </div>
  );
}

function StageButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition",
        active
          ? "bg-stage-foreground text-stage"
          : "bg-stage-foreground/10 text-stage-foreground hover:bg-stage-foreground/20",
      )}
    >
      {children}
    </button>
  );
}
