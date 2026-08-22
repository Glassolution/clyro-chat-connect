import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { audioConstraints, useAudioSettings } from "@/lib/audio-settings";

/**
 * Mesh WebRTC room over Lovable Cloud realtime broadcast signalling.
 * Handles microphone, camera and screen-sharing tracks between every
 * participant of a voice channel or a direct call.
 */

export type RemotePeer = {
  id: string;
  stream: MediaStream;
  speaking: boolean;
  hasVideo: boolean;
};

type SignalPayload = {
  from: string;
  to?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ],
};

export function useVoiceRoom(roomKey: string | null, selfId: string | null) {
  const [peers, setPeers] = useState<Record<string, RemotePeer>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const extraTrackRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const preDeafenMuteRef = useRef(false);
  const speakingSinceRef = useRef<Map<string, number>>(new Map());
  const sharingScreenRef = useRef(false);
  // Quem está compartilhando tela agora, para a interface destacar a transmissão.
  const [sharingPeers, setSharingPeers] = useState<string[]>([]);

  const audioSettings = useAudioSettings();
  const audioSettingsRef = useRef(audioSettings);
  audioSettingsRef.current = audioSettings;

  // Aplica a supressão de ruído (e companhia) na faixa que já está no ar, sem
  // reabrir o microfone nem derrubar a chamada.
  useEffect(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    void track.applyConstraints(audioConstraints(audioSettings)).catch(() => {
      // Nem todo dispositivo aceita trocar em tempo real; vale na próxima captura.
    });
  }, [audioSettings]);

  const send = useCallback((event: string, payload: object) => {
    void channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

  /**
   * Sobe o teto de bitrate da trilha de vídeo recém-adicionada. Sem isso o
   * WebRTC negocia um bitrate conservador e a tela compartilhada fica borrada.
   */
  const boostSender = (pc: RTCPeerConnection, track: MediaStreamTrack, maxBitrate: number) => {
    const sender = pc.getSenders().find((s) => s.track === track);
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings = params.encodings.map((e) => ({
      ...e,
      maxBitrate,
      scaleResolutionDownBy: 1,
    }));
    void sender.setParameters(params).catch(() => {
      /* alguns navegadores recusam; segue com o bitrate padrão */
    });
  };

  const attachAnalyser = useCallback((id: string, stream: MediaStream) => {
    try {
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (!ctx || stream.getAudioTracks().length === 0) return;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysersRef.current.set(id, analyser);
    } catch {
      /* speaking detection is best-effort */
    }
  }, []);

  const createPeer = useCallback(
    (peerId: string) => {
      const existing = pcsRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current.set(peerId, pc);
      const polite = (selfId ?? "") < peerId;

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });
      extraTrackRef.current.forEach((track) => {
        pc.addTrack(track);
      });

      const remoteStream = new MediaStream();
      setPeers((prev) => ({
        ...prev,
        [peerId]: { id: peerId, stream: remoteStream, speaking: false, hasVideo: false },
      }));

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => {
          if (!remoteStream.getTracks().includes(t)) remoteStream.addTrack(t);
        });
        if (!event.streams[0]) remoteStream.addTrack(event.track);
        attachAnalyser(peerId, remoteStream);
        setPeers((prev) => ({
          ...prev,
          [peerId]: {
            id: peerId,
            stream: remoteStream,
            speaking: prev[peerId]?.speaking ?? false,
            hasVideo: remoteStream.getVideoTracks().some((t) => t.readyState === "live"),
          },
        }));
        event.track.onended = () => {
          setPeers((prev) =>
            prev[peerId]
              ? {
                  ...prev,
                  [peerId]: {
                    ...prev[peerId],
                    hasVideo: remoteStream.getVideoTracks().some((t) => t.readyState === "live"),
                  },
                }
              : prev,
          );
        };
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send("signal", { from: selfId ?? "", to: peerId, candidate: event.candidate.toJSON() });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current.set(peerId, true);
          await pc.setLocalDescription();
          if (pc.localDescription) {
            send("signal", {
              from: selfId ?? "",
              to: peerId,
              description: pc.localDescription.toJSON(),
            });
          }
        } catch {
          /* ignore */
        } finally {
          makingOfferRef.current.set(peerId, false);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") pc.restartIce();
      };

      void polite;
      return pc;
    },
    [selfId, send, attachAnalyser],
  );

  const removePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    pc?.close();
    pcsRef.current.delete(peerId);
    analysersRef.current.delete(peerId);
    setPeers((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  // ---- join / leave -------------------------------------------------------
  useEffect(() => {
    if (!roomKey || !selfId) return;
    let cancelled = false;
    setConnecting(true);
    setError(null);

    const start = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Lido do ref para que mudar a preferência não derrube a call inteira;
          // trocas em chamada são aplicadas pelo efeito de applyConstraints.
          audio: audioConstraints(audioSettingsRef.current),
          video: false,
        });
      } catch {
        setError("Não conseguimos acessar seu microfone.");
        stream = new MediaStream();
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !mutedRef.current && !deafenedRef.current;
      });
      setLocalStream(stream);
      attachAnalyser("__self", stream);

      const channel = supabase.channel(`rtc-${roomKey}`, {
        config: { presence: { key: selfId }, broadcast: { self: false } },
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = Object.keys(state).filter((id) => id !== selfId);
        ids.forEach((id) => {
          if (!pcsRef.current.has(id) && selfId < id) createPeer(id);
        });
        pcsRef.current.forEach((_pc, id) => {
          if (!ids.includes(id)) removePeer(id);
        });
        setSharingPeers((prev) => prev.filter((id) => ids.includes(id)));
        // Quem entra depois precisa saber que já existe uma transmissão no ar.
        if (sharingScreenRef.current) {
          send("screen-share", { from: selfId, sharing: true });
        }
      });

      // Aviso de "estou compartilhando tela" para a interface destacar o tile.
      channel.on("broadcast", { event: "screen-share" }, ({ payload }) => {
        const data = payload as { from: string; sharing: boolean };
        if (!data || data.from === selfId) return;
        setSharingPeers((prev) => {
          const has = prev.includes(data.from);
          if (data.sharing && !has) return [...prev, data.from];
          if (!data.sharing && has) return prev.filter((id) => id !== data.from);
          return prev;
        });
      });

      channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
        const data = payload as SignalPayload;
        if (!data || data.to !== selfId || data.from === selfId) return;
        const peerId = data.from;
        const pc = pcsRef.current.get(peerId) ?? createPeer(peerId);
        const polite = selfId < peerId;

        try {
          if (data.description) {
            const offerCollision =
              data.description.type === "offer" &&
              (makingOfferRef.current.get(peerId) || pc.signalingState !== "stable");
            const ignore = !polite && offerCollision;
            ignoreOfferRef.current.set(peerId, ignore);
            if (ignore) return;
            if (offerCollision) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.description));
            } else {
              await pc.setRemoteDescription(new RTCSessionDescription(data.description));
            }
            if (data.description.type === "offer") {
              await pc.setLocalDescription();
              if (pc.localDescription) {
                send("signal", {
                  from: selfId,
                  to: peerId,
                  description: pc.localDescription.toJSON(),
                });
              }
            }
          } else if (data.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
              if (!ignoreOfferRef.current.get(peerId)) throw err;
            }
          }
        } catch {
          /* ignore signalling races */
        }
      });

      await channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: selfId, at: Date.now() });
          setConnecting(false);
        }
      });
    };

    void start();

    return () => {
      cancelled = true;
      setConnecting(false);
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      analysersRef.current.clear();
      setPeers({});
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
      extraTrackRef.current.forEach((t) => t.stop());
      extraTrackRef.current.clear();
      setScreenStream(null);
      setSharingScreen(false);
      setCameraOn(false);
    };
  }, [roomKey, selfId, createPeer, removePeer, send, attachAnalyser]);

  // ---- speaking detection -------------------------------------------------
  useEffect(() => {
    if (!roomKey) return;
    const buffer = new Uint8Array(256);
    const START = 0.035;
    const STOP = 0.018;
    const HOLD_MS = 320;

    const level = (analyser: AnalyserNode) => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = ((buffer[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / buffer.length);
    };

    const isSpeaking = (id: string, rms: number, wasSpeaking: boolean) => {
      const now = Date.now();
      if (rms > START) {
        speakingSinceRef.current.set(id, now);
        return true;
      }
      if (wasSpeaking && rms > STOP) return true;
      const last = speakingSinceRef.current.get(id) ?? 0;
      return wasSpeaking && now - last < HOLD_MS;
    };

    let selfSpeaking = false;

    const loop = () => {
      const remote = new Map<string, number>();
      analysersRef.current.forEach((analyser, id) => {
        const rms = level(analyser);
        if (id === "__self") {
          selfSpeaking = !mutedRef.current && isSpeaking("__self", rms, selfSpeaking);
          setLocalSpeaking(selfSpeaking);
        } else {
          remote.set(id, rms);
        }
      });

      setPeers((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          const current = next[id];
          if (!current) return;
          const rms = remote.get(id) ?? 0;
          const speaking = deafenedRef.current ? false : isSpeaking(id, rms, current.speaking);
          if (current.speaking !== speaking) {
            next[id] = { ...current, speaking };
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      rafRef.current = window.setTimeout(loop, 90) as unknown as number;
    };
    loop();
    return () => {
      if (rafRef.current) window.clearTimeout(rafRef.current);
      setLocalSpeaking(false);
    };
  }, [roomKey]);

  // ---- controls -----------------------------------------------------------
  const applyAudioEnabled = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !mutedRef.current && !deafenedRef.current;
    });
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (!next && deafenedRef.current) {
      deafenedRef.current = false;
      setDeafened(false);
    }
    applyAudioEnabled();
    if (next) setLocalSpeaking(false);
  }, [applyAudioEnabled]);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    if (next) {
      preDeafenMuteRef.current = mutedRef.current;
      mutedRef.current = true;
      setMuted(true);
      setLocalSpeaking(false);
    } else {
      mutedRef.current = preDeafenMuteRef.current;
      setMuted(preDeafenMuteRef.current);
    }
    applyAudioEnabled();
  }, [applyAudioEnabled]);

  const addExtraTrack = useCallback(async (key: string, track: MediaStreamTrack) => {
    extraTrackRef.current.set(key, track);
    pcsRef.current.forEach((pc) => {
      try {
        pc.addTrack(track);
      } catch {
        /* already added */
      }
    });
  }, []);

  const removeExtraTrack = useCallback((key: string) => {
    const track = extraTrackRef.current.get(key);
    if (!track) return;
    pcsRef.current.forEach((pc) => {
      pc.getSenders()
        .filter((s) => s.track === track)
        .forEach((s) => {
          try {
            pc.removeTrack(s);
          } catch {
            /* noop */
          }
        });
    });
    track.stop();
    extraTrackRef.current.delete(key);
  }, []);

  const toggleScreen = useCallback(async () => {
    if (sharingScreen) {
      removeExtraTrack("screen");
      setSharingScreen(false);
      setScreenStream(null);
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      track.onended = () => {
        removeExtraTrack("screen");
        setSharingScreen(false);
        setScreenStream(null);
      };
      await addExtraTrack("screen", track);
      setScreenStream(display);
      setSharingScreen(true);
    } catch {
      /* user cancelled */
    }
  }, [sharingScreen, addExtraTrack, removeExtraTrack]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      removeExtraTrack("camera");
      setCameraOn(false);
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      await addExtraTrack("camera", track);
      setCameraOn(true);
    } catch {
      setError("Não conseguimos acessar sua câmera.");
    }
  }, [cameraOn, addExtraTrack, removeExtraTrack]);

  return {
    peers: Object.values(peers),
    localStream,
    screenStream,
    localSpeaking,
    muted,
    deafened,
    sharingScreen,
    cameraOn,
    connecting,
    error,
    toggleMute,
    toggleDeafen,
    toggleScreen,
    toggleCamera,
  };
}
