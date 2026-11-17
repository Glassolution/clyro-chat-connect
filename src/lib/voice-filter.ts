import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import gtcrnWorkletUrl from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url";
import gtcrnWasmUrl from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url";

/**
 * Filtro de voz — o mesmo tipo de coisa que o Discord chama de Krisp.
 *
 * A diferença para um portão é o que ele faz com o som: em vez de decidir
 * "passa tudo" ou "não passa nada", uma rede treinada separa a voz do resto
 * dentro de cada trecho de áudio, e devolve só a voz. Por isso ela pode
 * trabalhar *enquanto* você fala — teclado, ventilador e televisão saem sem
 * levar a sua frase junto.
 *
 * São dois modelos, os dois em WebAssembly num AudioWorklet, fora da linha
 * principal e sem serviço nenhum na nuvem: nada do que é dito sai do navegador.
 *
 * - `strong` é o GTCRN, uma rede de 2024 que separa voz de ruído bem melhor
 *   que a geração anterior — inclusive ruído que muda, como teclado, louça e
 *   gente falando ao fundo. É o equivalente ao Krisp.
 * - `standard` é o RNNoise, o que o Jitsi usa: mais leve e com a voz em banda
 *   cheia, mas deixa passar mais do que é ruído de impacto.
 */
export type VoiceFilterModel = "strong" | "standard";

/** Os dois modelos rodam a 48 kHz; o contexto da chamada é fixado nessa taxa. */
export const FILTER_SAMPLE_RATE = 48000;

/**
 * A biblioteca é carregada só na hora de usar. Os nós dela estendem
 * `AudioWorkletNode`, que não existe no servidor — importar no topo derrubaria
 * a renderização da página inteira, antes mesmo de alguém entrar numa call.
 */
function loadLibrary() {
  return import("@sapphi-red/web-noise-suppressor");
}

/** Cada wasm é baixado uma vez por sessão e reaproveitado. */
const binaries = new Map<VoiceFilterModel, Promise<ArrayBuffer>>();
function loadBinary(model: VoiceFilterModel) {
  let promise = binaries.get(model);
  if (!promise) {
    promise = loadLibrary().then(({ loadGtcrn, loadRnnoise }) =>
      model === "strong"
        ? loadGtcrn({ url: gtcrnWasmUrl })
        : loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }),
    );
    // Uma falha de rede não pode condenar as próximas tentativas.
    promise.catch(() => binaries.delete(model));
    binaries.set(model, promise);
  }
  return promise;
}

const modules = new WeakMap<BaseAudioContext, Set<VoiceFilterModel>>();
async function ensureModule(ctx: BaseAudioContext, model: VoiceFilterModel) {
  const loaded = modules.get(ctx) ?? new Set<VoiceFilterModel>();
  modules.set(ctx, loaded);
  if (loaded.has(model)) return;
  await ctx.audioWorklet.addModule(model === "strong" ? gtcrnWorkletUrl : rnnoiseWorkletUrl);
  loaded.add(model);
}

export type VoiceFilterNode = AudioNode & { destroy: () => void };

/**
 * Monta o filtro para este contexto. Devolve `null` quando o navegador não
 * suporta (sem AudioWorklet, sem WebAssembly) — nesse caso a chamada segue com
 * o tratamento comum, que é bem melhor do que ficar sem áudio.
 */
export async function createVoiceFilter(
  ctx: BaseAudioContext,
  model: VoiceFilterModel = "strong",
): Promise<VoiceFilterNode | null> {
  try {
    if (!ctx.audioWorklet || ctx.sampleRate !== FILTER_SAMPLE_RATE) return null;
    const [library, binary] = await Promise.all([
      loadLibrary(),
      loadBinary(model),
      ensureModule(ctx, model),
    ]);
    const Node = model === "strong" ? library.GtcrnWorkletNode : library.RnnoiseWorkletNode;
    // O nome do tipo pede AudioContext, mas o nó só usa o que todo contexto tem.
    return new Node(ctx as AudioContext, { maxChannels: 2, wasmBinary: binary });
  } catch (error) {
    console.warn("[clyro] filtro de voz indisponível neste navegador", error);
    return null;
  }
}
