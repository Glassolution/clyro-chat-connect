/**
 * Guarda de eco — a segunda camada, a que o Discord e todo viva-voz têm.
 *
 * O cancelamento de eco do navegador tira a maior parte do que o alto-falante
 * devolve ao microfone, mas no alto-falante do notebook, alto, sempre sobra um
 * resto. E o filtro de voz não ajuda: o resto é voz — a do seu amigo —, então
 * ele passa inteiro, e o amigo se escuta de volta.
 *
 * A guarda compara o que está tocando (as vozes da call) com o que o microfone
 * pega. Ela aprende quanto do alto-falante costuma vazar para o microfone e,
 * enquanto os outros falam, só deixa passar o que for bem mais alto que esse
 * vazamento — a sua voz. Se for só eco, o microfone baixa 30 dB.
 *
 * Com fone de ouvido o vazamento aprendido é quase zero, então qualquer coisa
 * que você fale passa: a guarda não atrapalha quem não precisa dela.
 *
 * Tudo roda num AudioWorklet, na linha de áudio: não depende de timer da página
 * — que o navegador congela quando a aba fica em segundo plano.
 */

const PROCESSOR = "clyro-echo-guard";

const WORKLET_SOURCE = `
const BLOCK_SECONDS = 128 / sampleRate;
const HOLD_BLOCKS = Math.round(0.3 / BLOCK_SECONDS);
const DOUBLE_TALK_HOLD = Math.round(0.18 / BLOCK_SECONDS);
const FAR_ACTIVE = 1e-6;
const DUCKED = 0.03;
// Quanto a sua voz precisa passar do eco previsto para contar como fala: 6 dB.
const MARGIN = 4;

function coef(seconds) {
  return Math.exp(-BLOCK_SECONDS / seconds);
}
const ATTACK = coef(0.002);
const RELEASE = coef(0.04);
const GAIN_DOWN = coef(0.012);
const GAIN_UP = coef(0.004);
// O vazamento sobe devagar (uns 1,6 dB por segundo) e cai depressa.
const COUPLING_RISE = Math.pow(10, 1.6 / 10 * BLOCK_SECONDS);

function power(channels) {
  if (!channels || channels.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    count += data.length;
  }
  return count ? sum / count : 0;
}

class EchoGuard extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.near = 0;
    this.far = 0;
    this.farRing = new Float32Array(HOLD_BLOCKS);
    this.ringIndex = 0;
    this.coupling = 0.3;
    this.talkHold = 0;
    this.gain = 1;
    this.port.onmessage = (event) => {
      if (typeof event.data?.enabled === "boolean") this.enabled = event.data.enabled;
    };
  }

  follow(env, value) {
    const k = value > env ? ATTACK : RELEASE;
    return value + (env - value) * k;
  }

  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;

    this.near = this.follow(this.near, power(inputs[0]));
    this.far = this.follow(this.far, power(inputs[1]));
    this.farRing[this.ringIndex] = this.far;
    this.ringIndex = (this.ringIndex + 1) % HOLD_BLOCKS;
    let farHold = 0;
    for (let i = 0; i < HOLD_BLOCKS; i++) if (this.farRing[i] > farHold) farHold = this.farRing[i];

    let target = 1;
    if (this.enabled && farHold > FAR_ACTIVE) {
      const ratio = this.near / farHold;
      if (this.far > FAR_ACTIVE) {
        if (ratio < this.coupling) this.coupling += (ratio - this.coupling) * 0.05;
        else this.coupling = Math.min(2, this.coupling * COUPLING_RISE);
        this.coupling = Math.max(1e-5, this.coupling);
      }
      if (ratio > this.coupling * MARGIN) this.talkHold = DOUBLE_TALK_HOLD;
      else if (this.talkHold > 0) this.talkHold--;
      target = this.talkHold > 0 ? 1 : DUCKED;
    } else {
      this.talkHold = 0;
    }

    const k = target < this.gain ? GAIN_DOWN : GAIN_UP;
    const start = this.gain;
    this.gain = target + (this.gain - target) * k;
    // Sai como ajuste sobre 1 (ganho - 1): se o worklet parar, o ajuste vira
    // zero e o microfone segue aberto, em vez de mudo.
    const step = (this.gain - start) / out.length;
    for (let i = 0; i < out.length; i++) out[i] = start + step * (i + 1) - 1;
    return true;
  }
}

registerProcessor("${PROCESSOR}", EchoGuard);
`;

export type EchoGuard = {
  /** Onde o microfone passa: entra antes do envio. */
  duck: GainNode;
  /** Onde cada voz que toca na call é ligada, como referência do eco. */
  far: GainNode;
  setEnabled: (enabled: boolean) => void;
};

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();
function loadModule(ctx: BaseAudioContext) {
  let promise = loaded.get(ctx);
  if (!promise) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
    promise = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    promise.catch(() => loaded.delete(ctx));
    loaded.set(ctx, promise);
  }
  return promise;
}

/**
 * Monta a guarda ligada ao microfone (`near`). Devolve `null` se o navegador
 * não tiver AudioWorklet — aí o microfone segue só com o cancelamento dele.
 */
export async function createEchoGuard(
  ctx: AudioContext,
  near: AudioNode,
  enabled: boolean,
): Promise<EchoGuard | null> {
  try {
    if (!ctx.audioWorklet) return null;
    await loadModule(ctx);
    const node = new AudioWorkletNode(ctx, PROCESSOR, {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const far = ctx.createGain();
    const duck = ctx.createGain();
    // O worklet manda o ajuste (ganho - 1); somado a este 1 dá o ganho final.
    duck.gain.value = 1;
    near.connect(node, 0, 0);
    far.connect(node, 0, 1);
    node.connect(duck.gain);
    node.port.postMessage({ enabled });
    return {
      duck,
      far,
      setEnabled: (value) => node.port.postMessage({ enabled: value }),
    };
  } catch {
    return null;
  }
}
