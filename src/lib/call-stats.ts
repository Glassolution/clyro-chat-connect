/**
 * Estatísticas da call, lidas do próprio WebRTC a cada segundo. Servem para
 * descobrir o que segura a imagem ou a voz: a internet de quem envia, o
 * computador de quem envia ou de quem assiste, ou a rede no meio do caminho.
 *
 * Os contadores do WebRTC são acumulados desde o começo da conexão; taxas
 * (bitrate, perda, travadas) saem da diferença entre duas leituras.
 */

export type RawPeerStats = {
  peerId: string;
  report: RTCStatsReport;
  /** Id da sua faixa de tela, para separar tela de câmera no que você envia. */
  screenTrackId: string | null;
};

export type Limit = "none" | "cpu" | "bandwidth" | "other";

export type SendVideo = {
  kind: "screen" | "camera";
  codec: string;
  width: number;
  height: number;
  fps: number;
  kbps: number;
  limit: Limit;
  encoder: string;
  hardware: boolean | null;
};

export type RecvVideo = {
  codec: string;
  width: number;
  height: number;
  fps: number;
  kbps: number;
  lossPct: number;
  /** Travadas novas desde a leitura anterior e o total da conexão. */
  freezes: number;
  freezeTotal: number;
  /** Tempo parado em travadas, em segundos, desde o começo. */
  frozenSeconds: number;
  /** Folga de reprodução, em ms. */
  bufferMs: number;
  dropped: number;
  decoder: string;
  hardware: boolean | null;
  fecRecovered: number;
};

export type RecvAudio = {
  kbps: number;
  lossPct: number;
  jitterMs: number;
  bufferMs: number;
  /** Quanto do som foi "inventado" para tapar buraco, em %. */
  concealedPct: number;
};

export type PeerStats = {
  peerId: string;
  rttMs: number | null;
  /** Direto (P2P) ou por um servidor de retransmissão (TURN). */
  path: "direto" | "retransmitido" | "desconhecido";
  /** Quanto o controle de banda acha que dá para enviar a esta pessoa, em kbps. */
  sendBudgetKbps: number | null;
  sendVideo: SendVideo[];
  sendAudioKbps: number;
  recvVideo: RecvVideo[];
  recvAudio: RecvAudio[];
};

type Counter = {
  at: number;
  bytes: number;
  lost?: number;
  received?: number;
  freezes?: number;
  concealed?: number;
  samples?: number;
};

/** Guarda a leitura anterior de cada contador para tirar as taxas. */
export class CallStatsReader {
  private prev = new Map<string, Counter>();

  read(raw: RawPeerStats[]): PeerStats[] {
    const seen = new Set<string>();
    const out = raw.map(({ peerId, report, screenTrackId }) => {
      const get = (id: unknown) => (typeof id === "string" ? report.get(id) : undefined);
      const delta = (key: string, now: Counter) => {
        seen.add(key);
        const before = this.prev.get(key);
        this.prev.set(key, now);
        return before;
      };
      const kbps = (now: Counter, before: Counter | undefined) =>
        before && now.at > before.at
          ? Math.max(0, Math.round(((now.bytes - before.bytes) * 8) / (now.at - before.at)))
          : 0;
      const lossPct = (now: Counter, before: Counter | undefined) => {
        const lost = (now.lost ?? 0) - (before?.lost ?? 0);
        const got = (now.received ?? 0) - (before?.received ?? 0);
        return lost + got > 0 ? Math.max(0, (lost / (lost + got)) * 100) : 0;
      };
      const codecOf = (s: { codecId?: string }) =>
        String(get(s.codecId)?.mimeType ?? "").replace(/^(video|audio)\//i, "") || "—";

      const stats: PeerStats = {
        peerId,
        rttMs: null,
        path: "desconhecido",
        sendBudgetKbps: null,
        sendVideo: [],
        sendAudioKbps: 0,
        recvVideo: [],
        recvAudio: [],
      };

      report.forEach((s) => {
        if (s.type === "candidate-pair" && (s.nominated || s.selected) && s.state === "succeeded") {
          if (typeof s.currentRoundTripTime === "number") {
            stats.rttMs = Math.round(s.currentRoundTripTime * 1000);
          }
          if (typeof s.availableOutgoingBitrate === "number") {
            stats.sendBudgetKbps = Math.round(s.availableOutgoingBitrate / 1000);
          }
          const local = get(s.localCandidateId);
          const remote = get(s.remoteCandidateId);
          stats.path =
            local?.candidateType === "relay" || remote?.candidateType === "relay"
              ? "retransmitido"
              : "direto";
        }

        if (s.type === "outbound-rtp" && s.kind === "video") {
          const now = { at: s.timestamp, bytes: s.bytesSent ?? 0 };
          const before = delta(`${peerId}:${s.id}`, now);
          if (!s.frameWidth) return;
          const track = get(s.mediaSourceId)?.trackIdentifier;
          stats.sendVideo.push({
            kind: screenTrackId && track === screenTrackId ? "screen" : "camera",
            codec: codecOf(s),
            width: s.frameWidth ?? 0,
            height: s.frameHeight ?? 0,
            fps: Math.round(s.framesPerSecond ?? 0),
            kbps: kbps(now, before),
            limit: (s.qualityLimitationReason ?? "none") as Limit,
            encoder: s.encoderImplementation ?? "—",
            hardware: typeof s.powerEfficientEncoder === "boolean" ? s.powerEfficientEncoder : null,
          });
        }

        if (s.type === "outbound-rtp" && s.kind === "audio") {
          const now = { at: s.timestamp, bytes: s.bytesSent ?? 0 };
          stats.sendAudioKbps += kbps(now, delta(`${peerId}:${s.id}`, now));
        }

        if (s.type === "inbound-rtp" && s.kind === "video") {
          const now = {
            at: s.timestamp,
            bytes: s.bytesReceived ?? 0,
            lost: s.packetsLost ?? 0,
            received: s.packetsReceived ?? 0,
            freezes: s.freezeCount ?? 0,
          };
          const before = delta(`${peerId}:${s.id}`, now);
          if (!s.frameWidth) return;
          const emitted = s.jitterBufferEmittedCount ?? 0;
          stats.recvVideo.push({
            codec: codecOf(s),
            width: s.frameWidth ?? 0,
            height: s.frameHeight ?? 0,
            fps: Math.round(s.framesPerSecond ?? 0),
            kbps: kbps(now, before),
            lossPct: lossPct(now, before),
            freezes: Math.max(0, now.freezes - (before?.freezes ?? now.freezes)),
            freezeTotal: now.freezes,
            frozenSeconds: Math.round((s.totalFreezesDuration ?? 0) * 10) / 10,
            bufferMs: emitted > 0 ? Math.round(((s.jitterBufferDelay ?? 0) / emitted) * 1000) : 0,
            dropped: s.framesDropped ?? 0,
            decoder: s.decoderImplementation ?? "—",
            hardware: typeof s.powerEfficientDecoder === "boolean" ? s.powerEfficientDecoder : null,
            fecRecovered: s.fecPacketsReceived ?? 0,
          });
        }

        if (s.type === "inbound-rtp" && s.kind === "audio") {
          const now = {
            at: s.timestamp,
            bytes: s.bytesReceived ?? 0,
            lost: s.packetsLost ?? 0,
            received: s.packetsReceived ?? 0,
            concealed: s.concealedSamples ?? 0,
            samples: s.totalSamplesReceived ?? 0,
          };
          const before = delta(`${peerId}:${s.id}`, now);
          if (!s.packetsReceived) return;
          const samples = now.samples - (before?.samples ?? 0);
          const concealed = now.concealed - (before?.concealed ?? 0);
          const emitted = s.jitterBufferEmittedCount ?? 0;
          stats.recvAudio.push({
            kbps: kbps(now, before),
            lossPct: lossPct(now, before),
            jitterMs: Math.round((s.jitter ?? 0) * 1000),
            bufferMs: emitted > 0 ? Math.round(((s.jitterBufferDelay ?? 0) / emitted) * 1000) : 0,
            concealedPct: samples > 0 ? Math.max(0, (concealed / samples) * 100) : 0,
          });
        }
      });
      return stats;
    });
    // Conexões que saíram não guardam contador velho.
    [...this.prev.keys()].forEach((key) => {
      if (!seen.has(key)) this.prev.delete(key);
    });
    return out;
  }
}

export type Finding = { tone: "ok" | "warn" | "bad"; text: string };

/**
 * O que os números dizem, em português: o gargalo de cada lado. É o que a
 * pessoa lê primeiro no painel, antes de qualquer número.
 */
export function diagnose(peers: PeerStats[]): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => {
    if (!out.some((o) => o.text === f.text)) out.push(f);
  };
  peers.forEach((p) => {
    p.sendVideo.forEach((v) => {
      const what = v.kind === "screen" ? "Sua tela" : "Sua câmera";
      if (v.limit === "bandwidth") {
        add({ tone: "bad", text: `${what} está limitada pela sua internet (upload).` });
      } else if (v.limit === "cpu") {
        add({ tone: "bad", text: `${what} está limitada pelo seu computador (processador).` });
      }
      if (v.kind === "screen" && v.hardware === false) {
        add({
          tone: "warn",
          text: `Sua tela está sendo codificada em software (${v.codec}), sem a placa de vídeo.`,
        });
      }
    });
    p.recvVideo.forEach((v) => {
      if (v.lossPct >= 2) {
        add({
          tone: "bad",
          text: `Perdendo ${v.lossPct.toFixed(1)}% dos pacotes da imagem na rede.`,
        });
      }
      if (v.freezes > 0) add({ tone: "bad", text: "A imagem que chega travou agora há pouco." });
      if (v.fps > 0 && v.fps < 20) {
        add({ tone: "warn", text: `A imagem chega a ${v.fps} quadros por segundo.` });
      }
      if (v.hardware === false && v.width >= 1920) {
        add({
          tone: "warn",
          text: `A imagem é decodificada em software (${v.codec}) neste computador.`,
        });
      }
    });
    p.recvAudio.forEach((a) => {
      if (a.lossPct >= 2) {
        add({ tone: "bad", text: `Perdendo ${a.lossPct.toFixed(1)}% dos pacotes de voz na rede.` });
      }
      if (a.concealedPct >= 3) {
        add({ tone: "warn", text: "Pedaços da voz estão sendo tapados por falta de pacotes." });
      }
    });
    if (p.rttMs !== null && p.rttMs > 200) {
      add({ tone: "warn", text: `Atraso de ida e volta alto: ${p.rttMs} ms.` });
    }
    if (p.path === "retransmitido") {
      add({
        tone: "warn",
        text: "A conexão passa por um servidor de retransmissão, não é direta.",
      });
    }
  });
  if (out.length === 0 && peers.length > 0) {
    out.push({ tone: "ok", text: "Nada segurando a call agora." });
  }
  return out;
}
