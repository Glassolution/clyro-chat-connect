/**
 * Som da tela acima de 100% sem virar eco.
 *
 * O cancelamento de eco do navegador só tira do microfone o que ele mesmo toca
 * como áudio de call (faixa WebRTC num elemento de mídia). Som tocado pelo Web
 * Audio fica de fora: sai pelo alto-falante do notebook, entra no microfone e
 * volta para a sala — quem compartilhou escutava a própria tela de volta.
 *
 * Então o ganho passa pelo Web Audio, mas o resultado não toca de lá: ele dá a
 * volta por um par de conexões WebRTC dentro do próprio navegador e chega como
 * uma faixa de call comum, que o cancelamento de eco enxerga. A volta é local,
 * sem rede, e custa poucos milissegundos.
 */
export type ScreenAudioBooster = {
  /** A faixa já amplificada, pronta para um elemento <audio>. */
  ready: Promise<MediaStream>;
  setGain: (gain: number) => void;
  close: () => void;
};

let context: AudioContext | null = null;
function audioContext() {
  if (typeof AudioContext === "undefined") return null;
  if (!context || context.state === "closed") {
    context = new AudioContext({ latencyHint: "interactive" });
  }
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

/** Opus em estéreo e com bitrate de música: a volta não pode piorar o som. */
function musicOpus(description: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  const sdp = description.sdp;
  if (!sdp) return description;
  const payload = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!payload) return description;
  const munged = sdp.replace(
    new RegExp(`a=fmtp:${payload} (.*)`),
    (_line, params: string) =>
      `a=fmtp:${payload} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=320000;usedtx=0`,
  );
  return { type: description.type, sdp: munged };
}

export function createScreenAudioBooster(source: MediaStream): ScreenAudioBooster | null {
  const ctx = audioContext();
  if (!ctx || typeof RTCPeerConnection === "undefined") return null;

  const input = ctx.createMediaStreamSource(source);
  const gain = ctx.createGain();
  /*
   * Ganho alto num vídeo que já vem no talo estoura. O limitador segura os
   * picos e deixa o resto subir — é o que faz o 200% soar mais alto de fato,
   * e não só distorcido.
   */
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const destination = ctx.createMediaStreamDestination();
  destination.channelCount = 2;
  input.connect(gain).connect(limiter).connect(destination);

  const sender = new RTCPeerConnection({ iceServers: [] });
  const receiver = new RTCPeerConnection({ iceServers: [] });
  sender.onicecandidate = (event) => {
    if (event.candidate) void receiver.addIceCandidate(event.candidate).catch(() => {});
  };
  receiver.onicecandidate = (event) => {
    if (event.candidate) void sender.addIceCandidate(event.candidate).catch(() => {});
  };

  const ready = new Promise<MediaStream>((resolve, reject) => {
    receiver.ontrack = (event) => {
      // Menor atraso possível: o vídeo da tela não espera o som.
      const r = event.receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null };
      try {
        r.jitterBufferTarget = 0;
      } catch {
        /* navegador sem o ajuste */
      }
      resolve(new MediaStream([event.track]));
    };
    void (async () => {
      try {
        destination.stream.getAudioTracks().forEach((track) => {
          sender.addTrack(track, destination.stream);
        });
        const offer = musicOpus(await sender.createOffer());
        await sender.setLocalDescription(offer);
        await receiver.setRemoteDescription(offer);
        const answer = musicOpus(await receiver.createAnswer());
        await receiver.setLocalDescription(answer);
        await sender.setRemoteDescription(answer);
      } catch (error) {
        reject(error);
      }
    })();
  });
  // Quem chama decide o que fazer se falhar; aqui só não vira erro solto.
  ready.catch(() => {});

  return {
    ready,
    setGain: (value) => gain.gain.setTargetAtTime(value, ctx.currentTime, 0.03),
    close: () => {
      input.disconnect();
      gain.disconnect();
      limiter.disconnect();
      destination.stream.getTracks().forEach((track) => track.stop());
      sender.close();
      receiver.close();
    },
  };
}
