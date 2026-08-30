import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

/**
 * Filtro de voz — o mesmo tipo de coisa que o Discord chama de Krisp.
 *
 * A diferença para um portão é o que ele faz com o som: em vez de decidir
 * "passa tudo" ou "não passa nada", uma rede treinada separa a voz do resto
 * dentro de cada trecho de áudio, e devolve só a voz. Por isso ela pode
 * trabalhar *enquanto* você fala — teclado, ventilador e televisão saem sem
 * levar a sua frase junto.
 *
 * O modelo é o RNNoise, o mesmo que o Jitsi usa; roda em WebAssembly num
 * AudioWorklet, ou seja, fora da linha principal e sem serviço nenhum na
 * nuvem: nada do que é dito sai do navegador.
 */

/** O RNNoise foi treinado a 48 kHz e só faz sentido nessa taxa. */
export const FILTER_SAMPLE_RATE = 48000;

let binaryPromise: Promise<ArrayBuffer> | null = null;
const contextsWithModule = new WeakSet<AudioContext>();

/**
 * A biblioteca é carregada só na hora de usar. O nó dela estende
 * `AudioWorkletNode`, que não existe no servidor — importar no topo derrubaria
 * a renderização da página inteira, antes mesmo de alguém entrar numa call.
 */
function loadLibrary() {
  return import("@sapphi-red/web-noise-suppressor");
}

/** O wasm é baixado uma vez por sessão e reaproveitado. */
async function loadBinary() {
  const { loadRnnoise } = await loadLibrary();
  binaryPromise ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
  return binaryPromise;
}

async function ensureModule(ctx: AudioContext) {
  if (contextsWithModule.has(ctx)) return;
  await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
  contextsWithModule.add(ctx);
}

export type VoiceFilterNode = AudioNode & { destroy: () => void };

/**
 * Monta o filtro para este contexto. Devolve `null` quando o navegador não
 * suporta (sem AudioWorklet, sem WebAssembly) — nesse caso a chamada segue com
 * o tratamento comum, que é bem melhor do que ficar sem áudio.
 */
export async function createVoiceFilter(ctx: AudioContext): Promise<VoiceFilterNode | null> {
  try {
    if (!ctx.audioWorklet) return null;
    const [{ RnnoiseWorkletNode }, binary] = await Promise.all([
      loadLibrary(),
      loadBinary(),
      ensureModule(ctx),
    ]);
    return new RnnoiseWorkletNode(ctx, { maxChannels: 2, wasmBinary: binary });
  } catch (error) {
    console.warn("[clyro] filtro de voz indisponível neste navegador", error);
    return null;
  }
}
