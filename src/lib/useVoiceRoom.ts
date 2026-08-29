import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  playPeerJoinSound,
  playPeerLeaveSound,
  playScreenShareSound,
  playScreenStopSound,
} from "@/lib/call-sounds";
import {
  audioConstraints,
  displayConstraints,
  openMicrophone,
  screenBitrate,
  trackMatchesSettings,
  useMediaSettings,
  voiceBitrate,
  SCREEN_AUDIO_BITRATE,
  type MediaSettings,
} from "@/lib/media-settings";

/**
 * Mesh WebRTC room over Lovable Cloud realtime broadcast signalling.
 * Handles microphone, camera and screen-sharing tracks between every
 * participant of a voice channel or a direct call.
 */

export type RemotePeer = {
  /** Id da conexão (único por entrada na sala), não do usuário. */
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
 * A identidade na sinalização é por *entrada* na sala — não por usuário e nem
 * por aba. Com um id fixo, sair e voltar reaproveitava a mesma chave de
 * presença: para quem tinha ficado nada mudava, a conexão antiga (já morta do
 * outro lado) continuava no lugar e nunca era renegociada. Resultado exato do
 * relato: cada um sozinho na própria chamada. Um id novo a cada entrada obriga
 * o outro lado a derrubar a conexão velha e abrir uma limpa.
 */
function newConnectionId(userId: string) {
  return `${userId}__${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Saídas e entradas são serializadas: abrir o canal de sinalização novo antes
 * de o anterior terminar de sair deixava dois canais com o mesmo tópico no
 * mesmo socket, e o join novo era recusado em silêncio — de novo, sala vazia
 * para quem tinha acabado de voltar.
 */
let roomTeardown: Promise<void> = Promise.resolve();

/** Uma saída travada não pode segurar a entrada seguinte para sempre. */
function withTimeout(promise: Promise<unknown>, ms: number) {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    }),
  ]).then(() => undefined);
}

/**
 * Ajusta o Opus: banda cheia a 48 kHz, correção de erro ligada, sem corte por
 * silêncio e com o teto de bitrate da preferência. Em alta fidelidade o áudio
 * vai em estéreo a 256 kbps — qualidade de música, não de telefonia. É a metade
 * da nitidez que o `maxBitrate` do transmissor sozinho não entrega, porque o
 * padrão negociado no SDP é banda estreita mono.
 */
function tuneOpus(sdp: string | undefined, settings: MediaSettings) {
  if (!sdp) return sdp;
  const payload = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!payload) return sdp;

  const stereo = settings.highFidelity ? "1" : "0";
  const wanted: Record<string, string> = {
    stereo,
    "sprop-stereo": stereo,
    useinbandfec: "1",
    usedtx: "0",
    maxaveragebitrate: String(voiceBitrate(settings)),
    maxplaybackrate: "48000",
    "sprop-maxcapturerate": "48000",
    cbr: "0",
  };
  const params = Object.entries(wanted).map(([key, value]) => `${key}=${value}`);

  const fmtp = new RegExp(`a=fmtp:${payload} ([^\r\n]*)`);
  const existing = fmtp.exec(sdp);
  if (existing) {
    const kept = (existing[1] ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !((part.split("=")[0] ?? "") in wanted));
    return sdp.replace(fmtp, `a=fmtp:${payload} ${[...kept, ...params].join(";")}`);
  }
  return sdp.replace(
    new RegExp(`(a=rtpmap:${payload} opus/48000[^\r\n]*)`),
    `$1\r\na=fmtp:${payload} ${params.join(";")}`,
  );
}

/** Gera a descrição local (oferta ou resposta) já com o Opus ajustado. */
async function setLocalDescriptionForVoice(pc: RTCPeerConnection, settings: MediaSettings) {
  const description =
    pc.signalingState === "have-remote-offer" ? await pc.createAnswer() : await pc.createOffer();
  const sdp = tuneOpus(description.sdp, settings);
  await pc.setLocalDescription(sdp ? { ...description, sdp } : description);
}

/**
 * Teto de bitrate da faixa enviada. Vídeo ganha também `scaleResolutionDownBy`
 * fixo em 1: sem isso o navegador reduz a resolução por conta própria e a tela
 * compartilhada chega borrada mesmo com banda sobrando.
 */
function tuneSender(pc: RTCPeerConnection, track: MediaStreamTrack, maxBitrate: number) {
  const sender = pc.getSenders().find((s) => s.track === track);
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
  params.encodings = params.encodings.map((e) => ({
    ...e,
    maxBitrate,
    ...(track.kind === "video" ? { scaleResolutionDownBy: 1 } : {}),
  }));
  void sender.setParameters(params).catch(() => {
    /* alguns navegadores recusam; segue com o bitrate padrão */
  });
}

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
  /** Id desta conexão na sinalização, renovado a cada entrada na sala. */
  const selfIdRef = useRef<string | null>(null);
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
  /** Sincronia do microfone em andamento, e a última configuração já tentada. */
  const syncingMicRef = useRef(false);
  const lastMicSyncRef = useRef("");
  const sharingScreenRef = useRef(false);
  /** Primeira sincronia da presença já passou: só depois dela o som de chegada vale. */
  const syncedRef = useRef(false);
  // Quem está compartilhando tela agora, para a interface destacar a transmissão.
  const [sharingPeers, setSharingPeers] = useState<string[]>([]);

  const mediaSettings = useMediaSettings();
  const mediaSettingsRef = useRef(mediaSettings);
  mediaSettingsRef.current = mediaSettings;

  const send = useCallback((event: string, payload: object) => {
    void channelRef.current?.send({ type: "broadcast", event, payload });
  }, []);

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
      // Sem o resume o contexto pode nascer suspenso e nada é medido.
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
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
      const polite = (selfIdRef.current ?? "") < peerId;

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
        if (track.kind === "audio") tuneSender(pc, track, voiceBitrate(mediaSettingsRef.current));
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
          send("signal", {
            from: selfIdRef.current ?? "",
            to: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current.set(peerId, true);
          await setLocalDescriptionForVoice(pc, mediaSettingsRef.current);
          if (pc.localDescription) {
            send("signal", {
              from: selfIdRef.current ?? "",
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
    [send, attachAnalyser],
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
    if (!roomKey || !userId) return;
    let cancelled = false;
    setConnecting(true);
    setError(null);

    const start = async () => {
      // As preferências vêm do ref para que mexer nelas não derrube a call;
      // trocas em chamada passam pelo efeito de sincronia do microfone.
      const opened = await openMicrophone(mediaSettingsRef.current);
      if (!opened) setError("Não conseguimos acessar seu microfone.");
      const stream = opened ?? new MediaStream();

      const giveUp = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (localStreamRef.current === stream) localStreamRef.current = null;
      };
      if (cancelled) return giveUp();

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => {
        // "speech" faz o navegador preservar inteligibilidade quando precisa
        // cortar bitrate — o contrário da voz abafada.
        t.contentHint = "speech";
        t.enabled = !mutedRef.current && !deafenedRef.current;
      });
      setLocalStream(stream);
      attachAnalyser("__self", stream);

      // A saída anterior precisa ter terminado antes de reabrir o mesmo tópico.
      await roomTeardown.catch(() => {});
      if (cancelled) return giveUp();

      const selfId = newConnectionId(userId);
      selfIdRef.current = selfId;

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
          if (pcsRef.current.has(id)) return;
          createPeer(id);
          // Na primeira sincronia todo mundo é "novo": tocar aí seria uma
          // saraivada de avisos de quem já estava na sala antes de você.
          if (syncedRef.current) playPeerJoinSound();
        });
        pcsRef.current.forEach((_pc, id) => {
          if (ids.includes(id)) return;
          removePeer(id);
          if (syncedRef.current) playPeerLeaveSound();
        });
        syncedRef.current = true;
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
        if (data.sharing) playScreenShareSound();
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
            await pc.setRemoteDescription(new RTCSessionDescription(data.description));
            if (data.description.type === "offer") {
              await setLocalDescriptionForVoice(pc, mediaSettingsRef.current);
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

      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          // Também vale nas reconexões: sem repetir o track ao voltar de uma
          // queda, a pessoa some da sala para quem ficou.
          void channel.track({ id: selfId, at: Date.now() });
          setConnecting(false);
          setError(null);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Antes a falha passava batida e a sala aparecia vazia, como se
          // estivesse tudo certo.
          console.error("[clyro] sinalização da sala falhou", status, err);
          setConnecting(false);
          setError("A conexão com a sala caiu. Tentando voltar…");
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
      selfIdRef.current = null;
      syncedRef.current = false;
      // A próxima entrada abre o microfone do zero: a sincronia recomeça limpa.
      lastMicSyncRef.current = "";
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) {
        // Avisa a presença e só então sai: a próxima entrada espera por isto
        // antes de abrir o canal de novo (ver `roomTeardown`).
        roomTeardown = roomTeardown
          .catch(() => {})
          .then(() =>
            withTimeout(
              (async () => {
                try {
                  await channel.untrack();
                } catch {
                  /* o canal já pode ter caído */
                }
                await supabase.removeChannel(channel);
              })(),
              3000,
            ),
          );
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
  }, [roomKey, userId, createPeer, removePeer, send, attachAnalyser]);

  /**
   * Oferta nova para todo mundo. O teto de bitrate do transmissor muda na hora,
   * mas estéreo e banda do Opus moram no SDP: sem renegociar, ligar a alta
   * fidelidade no meio da call não mudaria nada do que sai daqui.
   */
  const renegotiate = useCallback(async () => {
    const selfId = selfIdRef.current;
    if (!selfId) return;
    await Promise.all(
      [...pcsRef.current.entries()].map(async ([peerId, pc]) => {
        if (pc.signalingState !== "stable") return;
        try {
          makingOfferRef.current.set(peerId, true);
          await setLocalDescriptionForVoice(pc, mediaSettingsRef.current);
          if (pc.localDescription) {
            send("signal", { from: selfId, to: peerId, description: pc.localDescription.toJSON() });
          }
        } catch {
          /* perdeu a corrida com outra negociação; a próxima mudança refaz */
        } finally {
          makingOfferRef.current.set(peerId, false);
        }
      }),
    );
  }, [send]);

  // ---- microfone: preferências e dispositivo ------------------------------
  /**
   * Troca a faixa do microfone em todas as conexões sem derrubar a chamada.
   * É o único caminho de verdade para mudar de dispositivo — e também para as
   * preferências de tratamento, quando o navegador ignora `applyConstraints`.
   */
  const replaceMicTrack = useCallback(async () => {
    const stream = await openMicrophone(mediaSettingsRef.current);
    const next = stream?.getAudioTracks()[0];
    if (!stream || !next) {
      setError("Não conseguimos abrir esse microfone.");
      return;
    }
    next.contentHint = "speech";
    next.enabled = !mutedRef.current && !deafenedRef.current;

    const previous = localStreamRef.current?.getAudioTracks() ?? [];
    await Promise.all(
      [...pcsRef.current.values()].map(async (pc) => {
        // Só a faixa do microfone: o som da tela compartilhada também é áudio
        // e não pode ser trocado aqui.
        const sender = pc.getSenders().find((s) => s.track && previous.includes(s.track));
        try {
          if (sender) await sender.replaceTrack(next);
          else pc.addTrack(next, stream);
        } catch {
          /* conexão fechando no meio da troca */
        }
        tuneSender(pc, next, voiceBitrate(mediaSettingsRef.current));
      }),
    );

    previous.forEach((t) => t.stop());
    localStreamRef.current = stream;
    setLocalStream(stream);
    attachAnalyser("__self", stream);
    setError(null);
    // A faixa nova pode ter outra contagem de canais: o SDP precisa acompanhar.
    await renegotiate();
  }, [attachAnalyser, renegotiate]);

  /**
   * Mantém a captura igual ao que está escolhido nas configurações. Uma
   * tentativa por mudança: `applyConstraints` primeiro, e se o que a faixa
   * entrega continuar diferente do pedido, recaptura o microfone.
   */
  useEffect(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!roomKey || !track || syncingMicRef.current) return;

    // Assinatura do pedido: sem ela, um microfone que se recusa a atender
    // exatamente o que foi pedido faria a recaptura girar em looping.
    const signature = JSON.stringify(audioConstraints(mediaSettings));
    if (lastMicSyncRef.current === signature) return;
    if (trackMatchesSettings(track, mediaSettings)) {
      lastMicSyncRef.current = signature;
      return;
    }

    let cancelled = false;
    const run = async () => {
      syncingMicRef.current = true;
      lastMicSyncRef.current = signature;
      try {
        try {
          await track.applyConstraints(audioConstraints(mediaSettings));
        } catch {
          /* nem todo dispositivo aceita trocar em tempo real */
        }
        if (cancelled || trackMatchesSettings(track, mediaSettings)) return;
        await replaceMicTrack();
      } finally {
        syncingMicRef.current = false;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [roomKey, localStream, mediaSettings, replaceMicTrack]);

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

  // Alta fidelidade ligada ou desligada em chamada: teto novo nos envios e uma
  // oferta nova para o Opus voltar (ou sair) do estéreo.
  useEffect(() => {
    if (!roomKey) return;
    const bitrate = voiceBitrate(mediaSettings);
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    pcsRef.current.forEach((pc) => {
      tracks.forEach((track) => tuneSender(pc, track, bitrate));
    });
    void renegotiate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, mediaSettings.highFidelity, renegotiate]);

  // Resolução e taxa de quadros valem na transmissão que já está no ar.
  useEffect(() => {
    const track = extraTrackRef.current.get("screen");
    if (!sharingScreen || !track) return;
    const video = displayConstraints(mediaSettings).video;
    if (typeof video === "object") {
      void track.applyConstraints(video).catch(() => {
        /* a origem da captura manda; vale na próxima transmissão */
      });
    }
    const bitrate = screenBitrate(mediaSettings);
    pcsRef.current.forEach((pc) => tuneSender(pc, track, bitrate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingScreen, mediaSettings.screenResolution, mediaSettings.screenFps]);

  // ---- speaking detection -------------------------------------------------
  /**
   * A borda tem que acender junto com a voz e apagar junto com o silêncio —
   * qualquer atraso se sente. Por isso a medição é por quadro (~16 ms), o
   * ataque é imediato (o primeiro trecho acima do limiar já acende) e a queda
   * segura só o vão entre sílabas, não o fim da frase.
   */
  useEffect(() => {
    if (!roomKey) return;
    const buffer = new Uint8Array(128);
    /** Silêncio tolerado entre sílabas; passou disso, a borda apaga. */
    const HOLD_MS = 160;
    // Limiares mínimos, para microfone muito silencioso não virar gatilho leve.
    const FLOOR_MIN = 0.004;
    const START_MIN = 0.02;
    const STOP_MIN = 0.01;
    // Janela do rastreador de ruído: ~2 s, o bastante para conter um silêncio
    // real entre frases.
    const FLOOR_WINDOW = 120;

    const floorSamples = new Map<string, number[]>();
    const lastPeak = new Map<string, number>();

    /** Energia da janela atual, sem suavização: é ela que dá a resposta rápida. */
    const level = (analyser: AnalyserNode, id: string) => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = ((buffer[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);

      const samples = floorSamples.get(id) ?? [];
      samples.push(rms);
      if (samples.length > FLOOR_WINDOW) samples.shift();
      floorSamples.set(id, samples);
      return rms;
    };

    /**
     * O ruído do ambiente é o menor valor visto na janela — durante a fala
     * sempre há uma pausa que encosta nele, e no silêncio ele é o próprio
     * sinal. Um limiar fixo não dá conta: sala barulhenta acima dele mantinha a
     * borda acesa para sempre.
     */
    const noiseFloor = (id: string) => {
      const samples = floorSamples.get(id);
      if (!samples || samples.length === 0) return FLOOR_MIN;
      return Math.max(FLOOR_MIN, Math.min(...samples));
    };

    const isSpeaking = (id: string, rms: number, wasSpeaking: boolean) => {
      const now = Date.now();
      const floor = noiseFloor(id);
      const startAt = Math.max(START_MIN, floor * 3.5);
      // Para sair, o limiar é mais baixo do que para entrar: uma vez falando,
      // a borda não pisca a cada oscilação da voz.
      const stopAt = Math.max(STOP_MIN, floor * 2);

      if (rms > (wasSpeaking ? stopAt : startAt)) {
        lastPeak.set(id, now);
        return true;
      }
      return wasSpeaking && now - (lastPeak.get(id) ?? 0) < HOLD_MS;
    };

    let selfSpeaking = false;

    const loop = () => {
      const remote = new Map<string, number>();
      analysersRef.current.forEach((analyser, id) => {
        const rms = level(analyser, id);
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

      rafRef.current = window.requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
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
          if (maxBitrate) tuneSender(pc, track, maxBitrate);
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
    playScreenStopSound();
    send("screen-share", { from: selfIdRef.current ?? "", sharing: false });
  }, [removeExtraTrack, send]);

  const toggleScreen = useCallback(async () => {
    if (sharingScreen) {
      stopSharing();
      return;
    }
    try {
      // Resolução, taxa de quadros e bitrate saem das configurações; o som da
      // tela vai em estéreo e sem tratamento de voz, para música e vídeo
      // chegarem do outro lado como saíram daqui.
      const preferences = mediaSettingsRef.current;
      const display = await navigator.mediaDevices.getDisplayMedia(displayConstraints(preferences));
      const track = display.getVideoTracks()[0];
      if (!track) {
        display.getTracks().forEach((t) => t.stop());
        return;
      }
      // A 60 fps a prioridade vira fluidez; abaixo disso, texto legível.
      track.contentHint = preferences.screenFps >= 60 ? "motion" : "detail";
      track.onended = stopSharing;
      const audioTrack = display.getAudioTracks()[0];
      if (audioTrack) {
        // Se o som da aba parar (troca de aba, por exemplo), o vídeo continua.
        audioTrack.onended = () => removeExtraTrack("screen-audio");
        await addExtraTrack("screen-audio", audioTrack, SCREEN_AUDIO_BITRATE);
      }
      await addExtraTrack("screen", track, screenBitrate(preferences));
      setScreenStream(display);
      setSharingScreen(true);
      sharingScreenRef.current = true;
      playScreenShareSound();
      send("screen-share", { from: selfIdRef.current ?? "", sharing: true });
    } catch {
      /* user cancelled */
    }
  }, [sharingScreen, addExtraTrack, removeExtraTrack, stopSharing, send]);

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
      send("raise-hand", { from: selfIdRef.current ?? "", raised: next });
      return next;
    });
  }, [send]);

  const sendReaction = useCallback(
    (emoji: string) => {
      const selfId = selfIdRef.current;
      if (!selfId) return;
      send("reaction", { from: selfId, emoji });
      const entry = { id: `${selfId}-${Date.now()}`, userId: userIdOfPeer(selfId), emoji };
      setReactions((prev) => [...prev, entry]);
      window.setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== entry.id));
      }, 4000);
    },
    [send],
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
