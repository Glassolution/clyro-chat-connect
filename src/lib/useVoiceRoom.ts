import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { audioConstraints, useAudioSettings } from "@/lib/audio-settings";

/**
 * Mesh WebRTC room over Lovable Cloud realtime broadcast signalling.
 * Handles microphone, camera and screen-sharing tracks between every
 * participant of a voice channel or a direct call.
 */

export type RemotePeer = {
  /** Id da conexão (único por aba), não do usuário. */
  id: string;
  /** Usuário por trás da conexão — é por ele que a interface acha o perfil. */
  userId: string;
  stream: MediaStream;
  speaking: boolean;
  hasVideo: boolean;
};

/** Qualidade estimada do enlace, para o indicador da barra de voz. */
export type LinkQuality = "good" | "fair" | "poor" | "unknown";

/**
 * A identidade na sinalização é por aba, não por usuário: com a chave de
 * presença sendo o id do usuário, duas abas da mesma conta colidiam e uma
 * derrubava a presença da outra — cada uma ficava sozinha na sala.
 */
const CONNECTION_SUFFIX = Math.random().toString(36).slice(2, 10);

export function userIdOfPeer(peerId: string) {
  return peerId.split("__")[0] ?? peerId;
}

type SignalPayload = {
  from: string;
  to?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

/**
 * STUN só resolve NAT simétrico parcialmente. Sem um TURN configurado, dois
 * participantes atrás de NAT simétrico (móvel, rede corporativa, parte dos
 * provedores domésticos) trocam candidatos e nunca conectam — que é exatamente
 * a sensação de "cada um sozinho na própria call". As variáveis abaixo ligam o
 * relay quando existirem.
 */
const TURN_URL = import.meta.env["VITE_TURN_URL"] as string | undefined;
const TURN_USERNAME = import.meta.env["VITE_TURN_USERNAME"] as string | undefined;
const TURN_CREDENTIAL = import.meta.env["VITE_TURN_CREDENTIAL"] as string | undefined;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
    ...(TURN_URL
      ? [
          {
            urls: TURN_URL,
            username: TURN_USERNAME ?? "",
            credential: TURN_CREDENTIAL ?? "",
          },
        ]
      : []),
  ],
};

export const hasTurnRelay = Boolean(TURN_URL);

export function useVoiceRoom(roomKey: string | null, userId: string | null) {
  /** Id desta aba na sinalização. O id do usuário continua vindo antes do "__". */
  const selfId = userId ? `${userId}__${CONNECTION_SUFFIX}` : null;
  const [peers, setPeers] = useState<Record<string, RemotePeer>>({});
  const [quality, setQuality] = useState<LinkQuality>("unknown");
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [handRaised, setHandRaised] = useState(false);
  /** Reações efêmeras recebidas: some sozinho depois de alguns segundos. */
  const [reactions, setReactions] = useState<{ id: string; userId: string; emoji: string }[]>([]);
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
        [peerId]: {
          id: peerId,
          userId: userIdOfPeer(peerId),
          stream: remoteStream,
          speaking: false,
          hasVideo: false,
        },
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
            userId: userIdOfPeer(peerId),
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

      // "disconnected" costuma ser rede oscilando: um restart cedo recupera a
      // sessão antes de ela morrer de vez.
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            /* navegador antigo sem restartIce */
          }
        }
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
        /*
         * Os dois lados criam a conexão. Antes só o lado de id menor criava, e
         * o outro só nascia no meio do tratamento de uma oferta — o pior momento
         * possível, porque é exatamente aí que a colisão de ofertas acontece.
         * Com a criação simétrica, a negociação educada resolve a colisão sozinha.
         */
        ids.forEach((id) => {
          if (!pcsRef.current.has(id)) createPeer(id);
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

      channel.on("broadcast", { event: "reaction" }, ({ payload }) => {
        const data = payload as { from: string; emoji: string };
        if (!data || data.from === selfId) return;
        const entry = {
          id: `${data.from}-${Date.now()}`,
          userId: userIdOfPeer(data.from),
          emoji: data.emoji,
        };
        setReactions((prev) => [...prev, entry]);
        window.setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== entry.id));
        }, 4000);
      });

      channel.on("broadcast", { event: "raise-hand" }, ({ payload }) => {
        const data = payload as { from: string; raised: boolean };
        if (!data || data.from === selfId) return;
        const owner = userIdOfPeer(data.from);
        setRaisedHands((prev) => {
          const has = prev.includes(owner);
          if (data.raised && !has) return [...prev, owner];
          if (!data.raised && has) return prev.filter((id) => id !== owner);
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
      sharingScreenRef.current = false;
      setSharingPeers([]);
      setCameraOn(false);
    };
  }, [roomKey, selfId, createPeer, removePeer, send, attachAnalyser]);

  /**
   * Qualidade do enlace: tempo de ida e volta e perda de pacotes lidos do
   * próprio WebRTC. É o que alimenta o indicador da barra de voz.
   */
  useEffect(() => {
    if (!roomKey) return;
    const timer = window.setInterval(async () => {
      const connections = [...pcsRef.current.values()];
      if (connections.length === 0) {
        setQuality("unknown");
        return;
      }
      let worst: LinkQuality = "good";
      for (const pc of connections) {
        try {
          const stats = await pc.getStats();
          let rtt = 0;
          let lossRatio = 0;
          stats.forEach((report) => {
            if (report.type === "candidate-pair" && report.state === "succeeded") {
              rtt = Math.max(rtt, (report.currentRoundTripTime ?? 0) * 1000);
            }
            if (report.type === "inbound-rtp" && !report.isRemote) {
              const lost = report.packetsLost ?? 0;
              const received = report.packetsReceived ?? 0;
              if (received + lost > 0) lossRatio = Math.max(lossRatio, lost / (received + lost));
            }
          });
          const level: LinkQuality =
            rtt > 300 || lossRatio > 0.08
              ? "poor"
              : rtt > 150 || lossRatio > 0.02
                ? "fair"
                : "good";
          if (level === "poor") worst = "poor";
          else if (level === "fair" && worst !== "poor") worst = "fair";
        } catch {
          /* getStats pode falhar durante a renegociação */
        }
      }
      setQuality(worst);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [roomKey]);

  // ---- speaking detection -------------------------------------------------
  useEffect(() => {
    if (!roomKey) return;
    const buffer = new Uint8Array(256);
    // Envelope: sobe na hora, desce devagar — cobre o silêncio entre sílabas
    // sem esperar o áudio inteiro cair.
    const RELEASE = 0.78;
    // Sustenta a borda através das pausas naturais entre palavras.
    const HOLD_MS = 600;
    // Rede de segurança: sem nenhum pico neste intervalo a borda apaga, doa a
    // quem doer. É o que garante que ela nunca fique acesa para sempre.
    const MAX_SILENCE_MS = 1400;
    // Limiares mínimos, para microfone muito silencioso não virar gatilho leve.
    const FLOOR_MIN = 0.004;
    const START_MIN = 0.03;
    const STOP_MIN = 0.016;
    // Janela do rastreador de ruído: precisa ser maior que uma pausa entre
    // palavras, para conter pelo menos um trecho de silêncio real.
    const FLOOR_WINDOW = 40;

    const envelopes = new Map<string, number>();
    const floorSamples = new Map<string, number[]>();
    const lastPeak = new Map<string, number>();

    const level = (analyser: AnalyserNode, id: string) => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = ((buffer[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);

      // O piso vem do rms cru, não do envelope: entre sílabas o cru cai ao nível
      // do ambiente na hora, enquanto o envelope ainda está descendo.
      const samples = floorSamples.get(id) ?? [];
      samples.push(rms);
      if (samples.length > FLOOR_WINDOW) samples.shift();
      floorSamples.set(id, samples);

      const previous = envelopes.get(id) ?? 0;
      const envelope = Math.max(rms, previous * RELEASE);
      envelopes.set(id, envelope);
      return envelope;
    };

    /**
     * O ruído do ambiente é o menor valor visto na janela — durante a fala
     * sempre há uma pausa que encosta nele, e no silêncio ele é o próprio sinal.
     * Um limiar fixo não dá conta: sala barulhenta acima dele mantinha a borda
     * acesa para sempre.
     */
    const noiseFloor = (id: string) => {
      const samples = floorSamples.get(id);
      if (!samples || samples.length === 0) return FLOOR_MIN;
      return Math.max(FLOOR_MIN, Math.min(...samples));
    };

    /**
     * Limiares relativos ao ruído medido, não absolutos.
     */
    const isSpeaking = (id: string, envelope: number, wasSpeaking: boolean) => {
      const now = Date.now();
      const floor = noiseFloor(id);

      const startAt = Math.max(START_MIN, floor * 4);
      const stopAt = Math.max(STOP_MIN, floor * 2.2);

      if (envelope > startAt) lastPeak.set(id, now);

      const peak = lastPeak.get(id) ?? 0;
      // Sem pico recente a borda cai, mesmo que o ruído continue alto.
      if (now - peak > MAX_SILENCE_MS) return false;

      if (envelope > (wasSpeaking ? stopAt : startAt)) {
        speakingSinceRef.current.set(id, now);
        return true;
      }

      const last = speakingSinceRef.current.get(id) ?? 0;
      return wasSpeaking && now - last < HOLD_MS;
    };

    let selfSpeaking = false;

    const loop = () => {
      const remote = new Map<string, number>();
      analysersRef.current.forEach((analyser, id) => {
        const envelope = level(analyser, id);
        if (id === "__self") {
          selfSpeaking = !mutedRef.current && isSpeaking("__self", envelope, selfSpeaking);
          setLocalSpeaking(selfSpeaking);
        } else {
          remote.set(id, envelope);
        }
      });

      setPeers((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          const current = next[id];
          if (!current) return;
          const envelope = remote.get(id) ?? 0;
          const speaking = deafenedRef.current ? false : isSpeaking(id, envelope, current.speaking);
          if (current.speaking !== speaking) {
            next[id] = { ...current, speaking };
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      rafRef.current = window.setTimeout(loop, 60) as unknown as number;
    };
    loop();
    return () => {
      if (rafRef.current) window.clearTimeout(rafRef.current);
      envelopes.clear();
      floorSamples.clear();
      lastPeak.clear();
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

  const addExtraTrack = useCallback(
    async (key: string, track: MediaStreamTrack, maxBitrate?: number) => {
      extraTrackRef.current.set(key, track);
      pcsRef.current.forEach((pc) => {
        try {
          pc.addTrack(track);
          if (maxBitrate && track.kind === "video") boostSender(pc, track, maxBitrate);
        } catch {
          /* already added */
        }
      });
    },
    [],
  );

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

  const stopSharing = useCallback(() => {
    removeExtraTrack("screen");
    removeExtraTrack("screen-audio");
    setSharingScreen(false);
    sharingScreenRef.current = false;
    setScreenStream(null);
    send("screen-share", { from: selfId ?? "", sharing: false });
  }, [removeExtraTrack, send, selfId]);

  const toggleScreen = useCallback(async () => {
    if (sharingScreen) {
      stopSharing();
      return;
    }
    try {
      // Áudio da tela sem o processamento de voz (eco/ruído), para música e
      // vídeos chegarem limpos; vídeo em Full HD e taxa de quadros alta.
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const track = display.getVideoTracks()[0];
      if (!track) {
        display.getTracks().forEach((t) => t.stop());
        return;
      }
      // "detail" prioriza nitidez (texto legível) em vez de fluidez.
      track.contentHint = "detail";
      track.onended = stopSharing;
      const audioTrack = display.getAudioTracks()[0];
      if (audioTrack) {
        // Se o som da aba parar (troca de aba, por exemplo), o vídeo continua.
        audioTrack.onended = () => removeExtraTrack("screen-audio");
        await addExtraTrack("screen-audio", audioTrack);
      }
      await addExtraTrack("screen", track, 8_000_000);
      setScreenStream(display);
      setSharingScreen(true);
      sharingScreenRef.current = true;
      send("screen-share", { from: selfId ?? "", sharing: true });
    } catch {
      /* user cancelled */
    }
  }, [sharingScreen, addExtraTrack, removeExtraTrack, stopSharing, send, selfId]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      removeExtraTrack("camera");
      setCameraOn(false);
      return;
    }
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const track = cam.getVideoTracks()[0];
      if (!track) return;
      track.contentHint = "motion";
      await addExtraTrack("camera", track, 2_500_000);
      setCameraOn(true);
    } catch {
      setError("Não conseguimos acessar sua câmera.");
    }
  }, [cameraOn, addExtraTrack, removeExtraTrack]);

  const toggleHand = useCallback(() => {
    setHandRaised((prev) => {
      const next = !prev;
      send("raise-hand", { from: selfId ?? "", raised: next });
      return next;
    });
  }, [send, selfId]);

  const sendReaction = useCallback(
    (emoji: string) => {
      if (!selfId) return;
      send("reaction", { from: selfId, emoji });
      const entry = { id: `${selfId}-${Date.now()}`, userId: userIdOfPeer(selfId), emoji };
      setReactions((prev) => [...prev, entry]);
      window.setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== entry.id));
      }, 4000);
    },
    [send, selfId],
  );

  return {
    peers: Object.values(peers),
    quality,
    reactions,
    sendReaction,
    raisedHands,
    handRaised,
    toggleHand,
    hasTurnRelay,
    localStream,
    screenStream,
    localSpeaking,
    muted,
    deafened,
    sharingScreen,
    sharingPeers,
    cameraOn,
    connecting,
    error,
    toggleMute,
    toggleDeafen,
    toggleScreen,
    toggleCamera,
  };
}
