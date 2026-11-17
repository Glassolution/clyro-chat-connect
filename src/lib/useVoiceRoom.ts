import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  createVoiceFilter,
  FILTER_SAMPLE_RATE,
  type VoiceFilterModel,
  type VoiceFilterNode,
} from "@/lib/voice-filter";
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
  type ShareOptions,
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
 * Atraso entre a medição e o portão. É o que permite abrir a passagem antes de
 * o começo da palavra chegar nela — sem isso a primeira consoante sai decepada.
 * Só entra no caminho com o portão ligado: sem portão ele era atraso puro, somado
 * a toda frase de todo mundo.
 */
const GATE_LOOKAHEAD_SECONDS = 0.03;

/** Silêncio segurado antes de o portão começar a fechar. */
const GATE_HOLD_MS = 320;

/** E o quanto ele leva descendo, já sem pressa nenhuma. */
const GATE_RELEASE_SECONDS = 0.3;

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

/**
 * Bitrate de partida do vídeo, em kbps. O Chrome começa toda faixa de vídeo em
 * ~300 kbps e sobe aos poucos: os primeiros segundos de uma tela compartilhada
 * chegavam em blocos, e quem entrava no meio via o mesmo. Partindo de 3 Mbps a
 * imagem já nasce nítida; se a rede não aguentar, o controle de banda desce.
 * Os parâmetros `x-google-*` são ignorados por quem não é Chromium.
 */
const VIDEO_START_KBPS = 3000;

function tuneVideoSdp(sdp: string | undefined) {
  if (!sdp) return sdp;
  const codec = /a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\/90000/gi;
  let out = sdp;
  for (const match of sdp.matchAll(codec)) {
    const payload = match[1];
    if (!payload) continue;
    const fmtp = new RegExp(`a=fmtp:${payload} ([^\r\n]*)`);
    const existing = fmtp.exec(out);
    if (existing) {
      if ((existing[1] ?? "").includes("x-google-start-bitrate")) continue;
      out = out.replace(
        fmtp,
        `a=fmtp:${payload} ${existing[1]};x-google-start-bitrate=${VIDEO_START_KBPS}`,
      );
    } else {
      out = out.replace(
        new RegExp(`(a=rtpmap:${payload} [^\r\n]*)`),
        `$1\r\na=fmtp:${payload} x-google-start-bitrate=${VIDEO_START_KBPS}`,
      );
    }
  }
  return out;
}

/** Gera a descrição local (oferta ou resposta) já com o Opus e o vídeo ajustados. */
async function setLocalDescriptionForVoice(pc: RTCPeerConnection, settings: MediaSettings) {
  const description =
    pc.signalingState === "have-remote-offer" ? await pc.createAnswer() : await pc.createOffer();
  const sdp = tuneVideoSdp(tuneOpus(description.sdp, settings));
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
  const fps = track.kind === "video" ? Math.round(track.getSettings().frameRate ?? 0) : 0;
  if (track.kind === "video") {
    // Sob aperto de CPU ou de banda o navegador prefere baixar a resolução —
    // é o que fazia o 4K chegar borrado do outro lado. A resolução fica; a 60
    // fps quem pediu fluidez é a taxa de quadros, então é ela que se segura.
    params.degradationPreference = fps >= 50 ? "maintain-framerate" : "maintain-resolution";
  }
  params.encodings = params.encodings.map((e) => ({
    ...e,
    maxBitrate,
    ...(track.kind === "video"
      ? {
          scaleResolutionDownBy: 1,
          priority: "high" as RTCPriorityType,
          networkPriority: "high" as RTCPriorityType,
          ...(fps > 0 ? { maxFramerate: fps } : {}),
        }
      : {}),
  }));
  void sender.setParameters(params).catch(() => {
    /* alguns navegadores recusam; segue com o bitrate padrão */
  });
}

/**
 * Ordem de codecs do vídeo. Nada sai da lista: o outro lado escolhe o melhor
 * que os dois têm em comum, então quem não tem AV1 (Safari sem chip novo, por
 * exemplo) recebe o próximo da fila sem ninguém fazer nada.
 *
 * - Tela: AV1, depois VP9, depois H.264. Medido com texto e troca de aba, o
 *   AV1 entregou só 2% dos quadros borrados, contra 17% do H.264 em hardware —
 *   que despencava para blocos a cada troca, descartava quadros e congelava
 *   cinco vezes mais tempo. O VP9 também lida bem com tela e fica de reserva.
 * - Câmera: H.264 primeiro, porque quase toda máquina codifica em hardware e
 *   rosto em movimento é exatamente o que ele faz bem.
 *
 * `avoidAv1` tira o AV1 da frente quando a máquina de quem compartilha não
 * deu conta de codificá-lo (ver o vigia de CPU no hook).
 */
function preferVideoCodecs(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  options: { screen?: boolean; avoidAv1?: boolean } = {},
) {
  if (track.kind !== "video") return;
  const transceiver = pc.getTransceivers().find((t) => t.sender.track === track);
  const capabilities =
    typeof RTCRtpReceiver !== "undefined" ? RTCRtpReceiver.getCapabilities?.("video") : null;
  if (!transceiver?.setCodecPreferences || !capabilities) return;
  const h264 = (fmtp: string) => {
    if (!fmtp.includes("packetization-mode=1")) return 2;
    // Perfil High (64) comprime melhor; o Baseline (42) é o que todo mundo lê.
    return fmtp.includes("profile-level-id=64") ? 0 : 1;
  };
  const rank = (codec: RTCRtpCodec) => {
    const mime = codec.mimeType.toLowerCase();
    const fmtp = codec.sdpFmtpLine ?? "";
    if (options.screen) {
      if (mime === "video/av1") return options.avoidAv1 ? 3 : 0;
      if (mime === "video/vp9") return 1;
      if (mime === "video/h264") return 4 + h264(fmtp);
      if (mime === "video/vp8") return 7;
      return 8; // rtx, red, ulpfec: ficam, só no fim
    }
    if (mime === "video/h264") return h264(fmtp);
    if (mime === "video/vp9") return 3;
    if (mime === "video/vp8") return 4;
    if (mime === "video/av1") return 5;
    return 6;
  };
  const codecs = [...capabilities.codecs].sort((a, b) => rank(a) - rank(b));
  try {
    transceiver.setCodecPreferences(codecs);
  } catch {
    /* navegador sem suporte: segue com a ordem padrão */
  }
}

/**
 * Dica de conteúdo da tela. "detail" põe o codificador no modo de tela, que
 * segura a nitidez e, para isso, segura quadros: medido com AV1, cada troca de
 * aba virava uma parada de ~300 ms. "motion" mantém a fluidez e, com AV1, a
 * troca de aba chega nítida quase sempre (2% de quadros borrados, contra 17% do
 * H.264). Só a 15 fps, quando a escolha já foi por texto parado, o modo de tela
 * vale a pena.
 */
function screenHint(settings: MediaSettings) {
  return settings.screenFps <= 15 ? "detail" : "motion";
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
  /** Você entrou nesta mesma call por outra aba ou aparelho: esta conexão sai. */
  const [superseded, setSuperseded] = useState(false);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  /** Renegociação pedida enquanto outra ainda corre, e quem está negociando agora. */
  const negotiationPendingRef = useRef<Set<string>>(new Set());
  const negotiatingRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const extraTrackRef = useRef<Map<string, MediaStreamTrack>>(new Map());
  /** Teto de bitrate de cada faixa extra, para quem entra depois receber igual. */
  const extraBitrateRef = useRef<Map<string, number>>(new Map());
  /**
   * Conexões em que a tela saiu do AV1 por falta de CPU, e quantas leituras
   * seguidas cada uma passou limitada pelo processador.
   */
  const av1FallbackRef = useRef<WeakSet<RTCPeerConnection>>(new WeakSet());
  const cpuStrikesRef = useRef<WeakMap<RTCPeerConnection, number>>(new WeakMap());
  // Cada faixa extra viaja dentro do próprio MediaStream: o outro lado recebe o
  // vídeo já agrupado e o player sabe que há algo novo para exibir.
  const extraStreamRef = useRef<Map<string, MediaStream>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  /**
   * Grafo do microfone: a fonte crua alimenta a medição e, por um atraso curto,
   * o portão que decide o que sai daqui. O atraso é o que permite o portão
   * abrir *antes* do começo da palavra passar por ele.
   */
  const micGraphRef = useRef<{
    source: MediaStreamAudioSourceNode;
    /** Nulo quando o navegador não suporta o filtro. */
    filter: VoiceFilterNode | null;
    /** Modelo que está no `filter` agora. */
    filterModel: VoiceFilterModel | null;
    rumble: BiquadFilterNode;
    delay: DelayNode;
    gain: GainNode;
    destination: MediaStreamAudioDestinationNode;
  } | null>(null);
  /** Captura crua do microfone; `localStreamRef` guarda o que é enviado. */
  const rawStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  /**
   * Quanto cada um está falando agora, de 0 a 1, já descontado o ruído da sala.
   * Fica num ref e não no estado: o medidor da call lê a cada quadro sem fazer
   * o React redesenhar nada.
   */
  const voiceLevelsRef = useRef<Map<string, number>>(new Map());
  const bandBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
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

  /**
   * Contexto de áudio da chamada. A taxa é fixada em 48 kHz porque é a única em
   * que o filtro de voz funciona — deixar o navegador escolher 44,1 kHz faria a
   * rede receber um áudio diferente do que ela conhece.
   */
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        audioCtxRef.current = new Ctor({
          sampleRate: FILTER_SAMPLE_RATE,
          latencyHint: "interactive",
        });
      } catch {
        // Navegador que não aceita fixar a taxa: vale o padrão dele.
        audioCtxRef.current = new Ctor();
      }
    }
    const ctx = audioCtxRef.current;
    // Sem o resume o contexto pode nascer suspenso e nada roda.
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  }, []);

  const attachAnalyser = useCallback(
    (id: string, stream: MediaStream) => {
      try {
        const ctx = ensureAudioContext();
        if (!ctx || stream.getAudioTracks().length === 0) return;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analysersRef.current.set(id, analyser);
      } catch {
        /* speaking detection is best-effort */
      }
    },
    [ensureAudioContext],
  );

  /**
   * Liga a entrada do grafo conforme a preferência: com o filtro no caminho ou
   * direto no corte grave. Trocar de ideia no meio da chamada é só isto — os
   * outros nós, e a faixa que sai daqui, continuam os mesmos.
   */
  const filterSwapRef = useRef<VoiceFilterModel | null>(null);
  const wireMicInput = useCallback(() => {
    const graph = micGraphRef.current;
    if (!graph) return;
    const { source, filter, rumble } = graph;
    const { voiceFilter, voiceFilterModel } = mediaSettingsRef.current;
    const useFilter = voiceFilter && !!filter;

    /*
     * Trocar de modelo no meio da call: o novo é montado ao lado, e só quando
     * está pronto entra no lugar do antigo. Até lá a voz segue pelo filtro que já
     * estava — ninguém fica sem som enquanto o wasm carrega.
     */
    if (
      voiceFilter &&
      graph.filterModel !== voiceFilterModel &&
      filterSwapRef.current !== voiceFilterModel
    ) {
      filterSwapRef.current = voiceFilterModel;
      void createVoiceFilter(source.context, voiceFilterModel).then((next) => {
        if (filterSwapRef.current === voiceFilterModel) filterSwapRef.current = null;
        const current = micGraphRef.current;
        const wanted = mediaSettingsRef.current.voiceFilterModel;
        if (!next) return;
        if (current !== graph || wanted !== voiceFilterModel) {
          next.destroy();
          return;
        }
        const old = graph.filter;
        try {
          graph.source.disconnect(old ?? graph.rumble);
        } catch {
          /* não estava ligado assim */
        }
        try {
          old?.disconnect();
        } catch {
          /* idem */
        }
        old?.destroy();
        graph.filter = next;
        graph.filterModel = voiceFilterModel;
        wireMicInput();
      });
    }

    // Desconectar por destino preserva o analisador, que também sai da fonte.
    try {
      source.disconnect(rumble);
    } catch {
      /* não estava ligado assim */
    }
    if (filter) {
      try {
        source.disconnect(filter);
      } catch {
        /* idem */
      }
      try {
        filter.disconnect();
      } catch {
        /* idem */
      }
    }

    if (useFilter && filter) {
      source.connect(filter);
      filter.connect(rumble);
    } else {
      source.connect(rumble);
    }
  }, []);

  /**
   * Liga o portão conforme a preferência. Com ele ligado a voz passa pelo
   * atraso de antecipação; desligado, vai direto — o atraso só existe para o
   * portão abrir a tempo, sem portão ele era só demora.
   */
  const wireGate = useCallback(() => {
    const graph = micGraphRef.current;
    if (!graph) return;
    const { rumble, delay, gain } = graph;
    for (const target of [delay, gain]) {
      try {
        rumble.disconnect(target);
      } catch {
        /* não estava ligado assim */
      }
    }
    try {
      delay.disconnect();
    } catch {
      /* idem */
    }
    if (mediaSettingsRef.current.noiseGate) {
      rumble.connect(delay);
      delay.connect(gain);
    } else {
      rumble.connect(gain);
    }
  }, []);

  /**
   * Monta (ou refaz a entrada de) o grafo do microfone e devolve o stream que
   * vai para os outros:
   *
   *   captura → filtro de voz → corte grave → (atraso → portão) → envio
   *
   * O filtro é quem faz o trabalho pesado — separa a voz do ruído dentro do som,
   * inclusive enquanto você fala. O portão vem depois e é opcional: com o filtro
   * ligado ele quase não tem o que fazer.
   *
   * Devolve `null` quando o navegador não deixa o áudio rodar; aí a captura crua
   * segue direto, que é melhor do que ficar mudo.
   */
  const buildMicPipeline = useCallback(
    async (raw: MediaStream): Promise<MediaStream | null> => {
      try {
        if (raw.getAudioTracks().length === 0) return null;
        const ctx = ensureAudioContext();
        if (!ctx) return null;

        const source = ctx.createMediaStreamSource(raw);
        const existing = micGraphRef.current;
        if (existing) {
          // Troca de microfone reaproveita o resto do grafo e a saída: a faixa
          // enviada continua a mesma, então ninguém precisa renegociar nada.
          try {
            existing.source.disconnect();
          } catch {
            /* já desconectada */
          }
          micGraphRef.current = { ...existing, source };
          wireMicInput();
          return existing.destination.stream;
        }

        // Porta batendo, passo, esbarrão na mesa: quase toda a energia disso mora
        // abaixo de 100 Hz, onde a voz não tem nada a perder.
        const rumble = ctx.createBiquadFilter();
        rumble.type = "highpass";
        rumble.frequency.value = 100;
        rumble.Q.value = 0.7;

        const delay = ctx.createDelay(0.5);
        delay.delayTime.value = GATE_LOOKAHEAD_SECONDS;
        const gain = ctx.createGain();
        gain.gain.value = mediaSettingsRef.current.noiseGate ? 0 : 1;
        const destination = ctx.createMediaStreamDestination();

        gain.connect(destination);

        /*
         * O medidor escuta depois do filtro, não a captura crua. É o que faz a
         * borda verde (e o portão, que segue o mesmo sinal) reagirem à voz e não
         * ao ruído: o que chega aqui já está limpo.
         */
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        rumble.connect(analyser);
        analysersRef.current.set("__self", analyser);

        // O filtro entra no grafo mesmo desligado nas preferências: montar custa
        // uma vez, e ligar depois vira só uma religada de fios.
        const model = mediaSettingsRef.current.voiceFilterModel;
        const filter = await createVoiceFilter(ctx, model);

        micGraphRef.current = {
          source,
          filter,
          filterModel: filter ? model : null,
          rumble,
          delay,
          gain,
          destination,
        };
        wireGate();
        wireMicInput();
        return destination.stream;
      } catch {
        return null;
      }
    },
    [ensureAudioContext, wireMicInput, wireGate],
  );

  /**
   * Abre ou fecha o portão. Abrir é imediato — a voz já vem atrasada pelo
   * lookahead, então nada se perde. Fechar espera, e ainda desce numa rampa
   * longa: era o fecho apressado que comia o fim das frases.
   */
  const gateCloseRef = useRef<number | null>(null);
  const applyGate = useCallback((open: boolean) => {
    const graph = micGraphRef.current;
    const ctx = audioCtxRef.current;
    if (!graph || !ctx) return;

    if (gateCloseRef.current) {
      window.clearTimeout(gateCloseRef.current);
      gateCloseRef.current = null;
    }

    const ramp = (target: number, seconds: number) => {
      const now = ctx.currentTime;
      graph.gain.gain.cancelScheduledValues(now);
      graph.gain.gain.setValueAtTime(graph.gain.gain.value, now);
      graph.gain.gain.linearRampToValueAtTime(target, now + seconds);
    };

    if (open || !mediaSettingsRef.current.noiseGate) {
      ramp(1, 0.015);
      return;
    }
    gateCloseRef.current = window.setTimeout(() => {
      gateCloseRef.current = null;
      ramp(0, GATE_RELEASE_SECONDS);
    }, GATE_HOLD_MS);
  }, []);

  /**
   * Serializa as renegociações de cada participante. Adicionar tela e som da
   * tela quase juntos dispara vários `negotiationneeded`; com a conexão fora de
   * `stable` o navegador rejeita a oferta, e antes essa falha era engolida — a
   * interface anunciava a tela sem que a faixa tivesse sido negociada.
   */
  const negotiatePeer = useCallback(
    async (peerId: string, pc: RTCPeerConnection): Promise<void> => {
      negotiationPendingRef.current.add(peerId);
      if (negotiatingRef.current.has(peerId)) return;
      negotiatingRef.current.add(peerId);

      try {
        while (negotiationPendingRef.current.has(peerId) && pc.signalingState !== "closed") {
          negotiationPendingRef.current.delete(peerId);

          if (pc.signalingState !== "stable") {
            await new Promise<void>((resolve) => {
              const done = () => {
                pc.removeEventListener("signalingstatechange", onState);
                window.clearTimeout(timer);
                resolve();
              };
              const onState = () => {
                if (pc.signalingState === "stable" || pc.signalingState === "closed") done();
              };
              const timer = window.setTimeout(done, 1500);
              pc.addEventListener("signalingstatechange", onState);
            });
          }

          if (pc.signalingState !== "stable") {
            // Ainda no meio de outra troca: tenta de novo na próxima volta.
            negotiationPendingRef.current.add(peerId);
            continue;
          }

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
          } finally {
            makingOfferRef.current.set(peerId, false);
          }
        }
      } catch {
        // Uma colisão pode mudar o estado entre a oferta e o setLocalDescription:
        // mantém a intenção para tentar de novo assim que estabilizar.
        if (pc.signalingState !== "closed") negotiationPendingRef.current.add(peerId);
      } finally {
        negotiatingRef.current.delete(peerId);
        if (negotiationPendingRef.current.has(peerId) && pc.signalingState !== "closed") {
          window.setTimeout(() => void negotiatePeer(peerId, pc), 0);
        }
      }
    },
    [send],
  );

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
      // Quem entra com a tela já no ar recebe a mesma qualidade de quem já
      // estava: antes a faixa ia sem teto nem codec, no padrão baixo do navegador.
      const tuneExtras = () => {
        extraTrackRef.current.forEach((track, key) => {
          const bitrate = extraBitrateRef.current.get(key);
          if (bitrate) tuneSender(pc, track, bitrate);
        });
      };
      extraTrackRef.current.forEach((track, key) => {
        const wrapper = extraStreamRef.current.get(key);
        if (wrapper) pc.addTrack(track, wrapper);
        else pc.addTrack(track);
        preferVideoCodecs(pc, track, { screen: key === "screen" });
      });
      tuneExtras();
      // Cada negociação pode devolver os parâmetros ao padrão: reaplica no fim.
      pc.addEventListener("signalingstatechange", () => {
        if (pc.signalingState === "stable") tuneExtras();
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

      /** Reflete no estado o que o stream do peer tem agora. */
      const syncPeer = () => {
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
      };

      pc.ontrack = (event) => {
        const track = event.track;
        event.streams[0]?.getTracks().forEach((t) => {
          if (!remoteStream.getTracks().includes(t)) remoteStream.addTrack(t);
        });
        if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
        attachAnalyser(peerId, remoteStream);
        syncPeer();

        /*
         * Parar de compartilhar não encerra a faixa do outro lado: ela apenas
         * emudece, e o último quadro ficava congelado na tela de quem assistia
         * até a call acabar. Tirar a faixa muda do stream é o que faz a
         * transmissão sumir de verdade. Só vale para vídeo — em áudio um mudo
         * costuma ser oscilação de rede, e cortar o som seria pior.
         */
        if (track.kind === "video") {
          track.onmute = () => {
            remoteStream.removeTrack(track);
            syncPeer();
          };
          track.onunmute = () => {
            if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
            syncPeer();
          };
        }
        track.onended = () => {
          remoteStream.removeTrack(track);
          syncPeer();
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

      pc.onnegotiationneeded = () => {
        void negotiatePeer(peerId, pc);
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
    [send, attachAnalyser, negotiatePeer],
  );

  const removePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    pc?.close();
    pcsRef.current.delete(peerId);
    negotiationPendingRef.current.delete(peerId);
    negotiatingRef.current.delete(peerId);
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
    let onPageHide: (() => void) | null = null;
    setConnecting(true);
    setError(null);
    setSuperseded(false);

    const start = async () => {
      // As preferências vêm do ref para que mexer nelas não derrube a call;
      // trocas em chamada passam pelo efeito de sincronia do microfone.
      const opened = await openMicrophone(mediaSettingsRef.current);
      if (!opened) setError("Não conseguimos acessar seu microfone.");
      const raw = opened ?? new MediaStream();

      const giveUp = () => {
        raw.getTracks().forEach((t) => t.stop());
        if (rawStreamRef.current === raw) rawStreamRef.current = null;
      };
      if (cancelled) return giveUp();

      rawStreamRef.current = raw;
      // O que sai daqui é a saída do grafo — filtro de voz e portão no caminho.
      // Sem grafo (navegador bloqueando o áudio), a captura crua vai direto.
      const processed = await buildMicPipeline(raw);
      if (cancelled) return giveUp();
      const stream = processed ?? raw;
      if (!processed) attachAnalyser("__self", raw);

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach((t) => {
        // "speech" faz o navegador preservar inteligibilidade quando precisa
        // cortar bitrate — o contrário da voz abafada.
        t.contentHint = "speech";
        t.enabled = !mutedRef.current && !deafenedRef.current;
      });
      setLocalStream(stream);

      // A saída anterior precisa ter terminado antes de reabrir o mesmo tópico.
      await roomTeardown.catch(() => {});
      if (cancelled) return giveUp();

      const selfId = newConnectionId(userId);
      selfIdRef.current = selfId;
      // Hora fixa desta entrada. Reconectar não muda: senão uma aba antiga que
      // reconectasse passaria a valer mais que a entrada nova da mesma pessoa.
      const joinedAt = Date.now();

      const channel = supabase.channel(`rtc-${roomKey}`, {
        config: { presence: { key: selfId }, broadcast: { self: false } },
      });
      channelRef.current = channel;

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id?: string; at?: number }>();
        /*
         * Uma pessoa, um lugar na call. A presença guarda conexões, não pessoas:
         * quem saía e voltava antes de o servidor derrubar a conexão velha (rede
         * caindo, aba recarregada) aparecia duas vezes, e quem entrava por duas
         * abas também. Vale só a entrada mais recente de cada pessoa.
         */
        const newest = new Map<string, { id: string; at: number }>();
        Object.entries(state).forEach(([id, metas]) => {
          const at = Math.max(0, ...metas.map((meta) => Number(meta?.at) || 0));
          const owner = userIdOfPeer(id);
          const current = newest.get(owner);
          if (!current || at > current.at || (at === current.at && id > current.id)) {
            newest.set(owner, { id, at });
          }
        });
        // Você entrou de novo em outro lugar: esta aba deixa a call para a nova.
        const mine = newest.get(userId);
        if (state[selfId] && mine && mine.id !== selfId) {
          setSuperseded(true);
          return;
        }
        const ids = [...newest.values()]
          .map((entry) => entry.id)
          .filter((id) => userIdOfPeer(id) !== userId);
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

      // Fechar ou recarregar a aba avisa a saída na hora, sem esperar o
      // servidor perceber que a conexão morreu.
      onPageHide = () => {
        void channel.untrack();
      };
      window.addEventListener("pagehide", onPageHide);

      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          // Também vale nas reconexões: sem repetir o track ao voltar de uma
          // queda, a pessoa some da sala para quem ficou.
          void channel.track({ id: selfId, at: joinedAt });
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
      if (onPageHide) window.removeEventListener("pagehide", onPageHide);
      setConnecting(false);
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      negotiationPendingRef.current.clear();
      negotiatingRef.current.clear();
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
      rawStreamRef.current?.getTracks().forEach((t) => t.stop());
      rawStreamRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      if (micGraphRef.current) {
        const { source, filter, rumble, delay, gain } = micGraphRef.current;
        filter?.destroy();
        [source, filter, rumble, delay, gain].forEach((node) => {
          if (!node) return;
          try {
            node.disconnect();
          } catch {
            /* o contexto pode já ter sido fechado */
          }
        });
        micGraphRef.current = null;
      }
      setLocalStream(null);
      extraTrackRef.current.forEach((t) => t.stop());
      extraTrackRef.current.clear();
      extraStreamRef.current.clear();
      extraBitrateRef.current.clear();
      setScreenStream(null);
      setSharingScreen(false);
      sharingScreenRef.current = false;
      setSharingPeers([]);
      setCameraOn(false);
    };
  }, [roomKey, userId, createPeer, removePeer, send, attachAnalyser, buildMicPipeline]);

  /**
   * Oferta nova para todo mundo. O teto de bitrate do transmissor muda na hora,
   * mas estéreo e banda do Opus moram no SDP: sem renegociar, ligar a alta
   * fidelidade no meio da call não mudaria nada do que sai daqui.
   */
  const renegotiate = useCallback(async () => {
    if (!selfIdRef.current) return;
    await Promise.all(
      [...pcsRef.current.entries()].map(([peerId, pc]) => negotiatePeer(peerId, pc)),
    );
  }, [negotiatePeer]);

  // ---- microfone: preferências e dispositivo ------------------------------
  /**
   * Troca a faixa do microfone em todas as conexões sem derrubar a chamada.
   * É o único caminho de verdade para mudar de dispositivo — e também para as
   * preferências de tratamento, quando o navegador ignora `applyConstraints`.
   */
  const replaceMicTrack = useCallback(async () => {
    const raw = await openMicrophone(mediaSettingsRef.current);
    const captured = raw?.getAudioTracks()[0];
    if (!raw || !captured) {
      setError("Não conseguimos abrir esse microfone.");
      return;
    }
    captured.contentHint = "speech";

    const previousRaw = rawStreamRef.current;
    const previousOut = localStreamRef.current?.getAudioTracks() ?? [];
    rawStreamRef.current = raw;

    // Com o grafo montado, trocar de microfone é só reconectar a entrada: a
    // faixa que os outros recebem continua sendo a saída do portão, então não
    // há nada para substituir nem para renegociar.
    const processed = await buildMicPipeline(raw);
    const outgoing = processed ?? raw;
    const nextTrack = outgoing.getAudioTracks()[0];
    const sameTrack = !!nextTrack && previousOut.includes(nextTrack);

    if (nextTrack && !sameTrack) {
      nextTrack.enabled = !mutedRef.current && !deafenedRef.current;
      await Promise.all(
        [...pcsRef.current.values()].map(async (pc) => {
          // Só a faixa do microfone: o som da tela compartilhada também é
          // áudio e não pode ser trocado aqui.
          const sender = pc.getSenders().find((s) => s.track && previousOut.includes(s.track));
          try {
            if (sender) await sender.replaceTrack(nextTrack);
            else pc.addTrack(nextTrack, outgoing);
          } catch {
            /* conexão fechando no meio da troca */
          }
          tuneSender(pc, nextTrack, voiceBitrate(mediaSettingsRef.current));
        }),
      );
      previousOut.forEach((t) => t.stop());
      localStreamRef.current = outgoing;
      setLocalStream(outgoing);
    }

    previousRaw?.getTracks().forEach((t) => t.stop());
    if (!processed) attachAnalyser("__self", raw);
    setError(null);
    // Contagem de canais pode ter mudado: o SDP precisa acompanhar.
    if (!sameTrack) await renegotiate();
  }, [attachAnalyser, buildMicPipeline, renegotiate]);

  /**
   * Mantém a captura igual ao que está escolhido nas configurações. Uma
   * tentativa por mudança: `applyConstraints` primeiro, e se o que a faixa
   * entrega continuar diferente do pedido, recaptura o microfone.
   */
  useEffect(() => {
    // A conferência é na captura crua: a saída do grafo é uma faixa sintética,
    // que não carrega dispositivo nem tratamento nenhum nas suas configurações.
    const track = rawStreamRef.current?.getAudioTracks()[0];
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
      const screenTrack = extraTrackRef.current.get("screen");
      for (const [peerId, pc] of [...pcsRef.current.entries()]) {
        try {
          const stats = await pc.getStats();
          let rtt = 0;
          let lossRatio = 0;
          let screenCpuBound = false;
          stats.forEach((report) => {
            if (
              screenTrack &&
              report.type === "outbound-rtp" &&
              report.kind === "video" &&
              report.qualityLimitationReason === "cpu" &&
              stats.get(report.mediaSourceId)?.trackIdentifier === screenTrack.id &&
              String(stats.get(report.codecId)?.mimeType).toLowerCase() === "video/av1"
            ) {
              screenCpuBound = true;
            }
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

          /*
           * O AV1 é codificado em software, uma cópia por pessoa da sala. Se a
           * máquina de quem compartilha não der conta, o navegador começa a
           * derrubar quadros. Duas leituras seguidas assim (6 s) e essa conexão
           * passa para o VP9, que é bem mais leve — uma vez só, sem ir e voltar.
           */
          const strikes = screenCpuBound ? (cpuStrikesRef.current.get(pc) ?? 0) + 1 : 0;
          cpuStrikesRef.current.set(pc, strikes);
          if (screenTrack && strikes >= 2 && !av1FallbackRef.current.has(pc)) {
            av1FallbackRef.current.add(pc);
            preferVideoCodecs(pc, screenTrack, { screen: true, avoidAv1: true });
            void negotiatePeer(peerId, pc);
          }
        } catch {
          /* getStats pode falhar durante a renegociação */
        }
      }
      setQuality(worst);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [roomKey, negotiatePeer]);

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
    track.contentHint = screenHint(mediaSettings);
    const bitrate = screenBitrate(mediaSettings);
    extraBitrateRef.current.set("screen", bitrate);
    pcsRef.current.forEach((pc) => tuneSender(pc, track, bitrate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharingScreen, mediaSettings.screenResolution, mediaSettings.screenFps]);

  /**
   * Rede de segurança do portão: se o navegador segurar o áudio suspenso, a
   * saída processada não produz som nenhum e a chamada ficaria muda. Depois de
   * algumas tentativas de acordar o contexto, a captura crua volta para o lugar
   * dela — sem portão, mas com voz.
   */
  useEffect(() => {
    if (!roomKey) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      const ctx = audioCtxRef.current;
      if (!ctx || !micGraphRef.current) return;
      if (ctx.state === "running") {
        window.clearInterval(timer);
        return;
      }
      void ctx.resume().catch(() => {});
      attempts += 1;
      if (attempts < 5) return;
      window.clearInterval(timer);

      const rawTrack = rawStreamRef.current?.getAudioTracks()[0];
      const raw = rawStreamRef.current;
      if (!rawTrack || !raw) return;
      console.warn("[clyro] áudio suspenso pelo navegador: microfone sem o portão de ruído");
      rawTrack.enabled = !mutedRef.current && !deafenedRef.current;
      const previous = localStreamRef.current?.getAudioTracks() ?? [];
      pcsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track && previous.includes(s.track));
        void sender?.replaceTrack(rawTrack).catch(() => {});
      });
      micGraphRef.current = null;
      localStreamRef.current = raw;
      setLocalStream(raw);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [roomKey]);

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
    const HOLD_MS = 220;
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

    /** A energia acima do ruído, numa escala de 0 a 1 que a voz normal preenche. */
    const voiceLevel = (id: string, rms: number) =>
      Math.min(1, Math.max(0, (rms - noiseFloor(id) * 1.5) / 0.1));

    const loop = () => {
      const remote = new Map<string, number>();
      const levels = new Map<string, number>();
      analysersRef.current.forEach((analyser, id) => {
        const rms = level(analyser, id);
        const silenced = id === "__self" ? mutedRef.current : deafenedRef.current;
        levels.set(id, silenced ? 0 : voiceLevel(id, rms));
        if (id === "__self") {
          // Sem truque de espectro nem espera de quadros: o que chega ao medidor
          // já passou pelo filtro, então energia aqui quer dizer voz.
          const next = !mutedRef.current && isSpeaking("__self", rms, selfSpeaking);
          if (next !== selfSpeaking) {
            selfSpeaking = next;
            setLocalSpeaking(next);
            // O mesmo sinal que acende a bola verde abre o portão: o que os
            // outros ouvem é exatamente o que a borda mostra.
            applyGate(next);
          }
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

      voiceLevelsRef.current = levels;
      rafRef.current = window.requestAnimationFrame(loop);
    };
    loop();
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      floorSamples.clear();
      lastPeak.clear();
      voiceLevelsRef.current = new Map();
      setLocalSpeaking(false);
    };
  }, [roomKey, applyGate]);

  // Ligar ou desligar o portão vale na hora: desligado, a passagem fica aberta;
  // ligado, fecha até a próxima palavra — o laço reabre em um quadro.
  useEffect(() => {
    wireGate();
    applyGate(!mediaSettings.noiseGate);
  }, [mediaSettings.noiseGate, applyGate, wireGate]);

  // O filtro entra, sai ou troca de modelo sem reabrir o microfone.
  useEffect(() => {
    wireMicInput();
  }, [mediaSettings.voiceFilter, mediaSettings.voiceFilterModel, wireMicInput]);

  /**
   * As faixas da voz de quem fala mais alto agora, para o medidor da call: grave,
   * médio-grave, médio e agudo da fala, cada uma de 0 a 1 e já multiplicada pelo
   * volume, então silêncio dá zero. Devolve o volume. Lê direto do analisador,
   * sem estado: quem chama decide o ritmo (um quadro por vez).
   */
  const readVoiceBands = useCallback((out: number[]) => {
    let loudestId: string | null = null;
    let loudest = 0;
    voiceLevelsRef.current.forEach((value, id) => {
      if (value > loudest) {
        loudest = value;
        loudestId = id;
      }
    });
    const analyser = loudestId ? analysersRef.current.get(loudestId) : undefined;
    if (!analyser || loudest < 0.04) {
      out.fill(0);
      return 0;
    }
    const size = analyser.frequencyBinCount;
    if (!bandBufferRef.current || bandBufferRef.current.length !== size) {
      bandBufferRef.current = new Uint8Array(size);
    }
    const bins = bandBufferRef.current;
    analyser.getByteFrequencyData(bins);
    // A fala mora entre ~100 Hz e ~4 kHz; cada faixa pega o pico do seu trecho.
    const hz = analyser.context.sampleRate / analyser.fftSize;
    const edges = [100, 300, 700, 1600, 4000].map((f) => Math.max(1, Math.round(f / hz)));
    const gain = Math.min(1, loudest * 1.4);
    for (let band = 0; band < out.length && band < 4; band += 1) {
      let peak = 0;
      const end = Math.min(size, Math.max(edges[band + 1] ?? size, (edges[band] ?? 1) + 1));
      for (let bin = edges[band] ?? 1; bin < end; bin += 1) peak = Math.max(peak, bins[bin] ?? 0);
      out[band] = (peak / 255) * gain;
    }
    return loudest;
  }, []);

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
      if (maxBitrate) extraBitrateRef.current.set(key, maxBitrate);
      else extraBitrateRef.current.delete(key);
      const wrapper = new MediaStream([track]);
      extraStreamRef.current.set(key, wrapper);
      pcsRef.current.forEach((pc) => {
        try {
          pc.addTrack(track, wrapper);
          preferVideoCodecs(pc, track, {
            screen: key === "screen",
            avoidAv1: av1FallbackRef.current.has(pc),
          });
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
    extraStreamRef.current.delete(key);
    extraBitrateRef.current.delete(key);
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

  const toggleScreen = useCallback(
    async (options?: ShareOptions) => {
      if (sharingScreen) {
        stopSharing();
        return;
      }
      try {
        // Resolução, taxa de quadros e bitrate saem das configurações; o som da
        // tela vai em estéreo e sem tratamento de voz, para música e vídeo
        // chegarem do outro lado como saíram daqui.
        const preferences = mediaSettingsRef.current;
        const display = await navigator.mediaDevices.getDisplayMedia(
          displayConstraints(preferences, options),
        );
        const track = display.getVideoTracks()[0];
        if (!track) {
          display.getTracks().forEach((t) => t.stop());
          return;
        }
        track.contentHint = screenHint(preferences);
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
    },
    [sharingScreen, addExtraTrack, removeExtraTrack, stopSharing, send],
  );

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
    superseded,
    toggleMute,
    toggleDeafen,
    toggleScreen,
    toggleCamera,
    readVoiceBands,
  };
}
