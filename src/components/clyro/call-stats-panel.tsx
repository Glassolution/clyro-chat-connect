import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, X } from "@/components/icons";
import { cn } from "@/lib/utils";
import { CallStatsReader, diagnose, type PeerStats, type RawPeerStats } from "@/lib/call-stats";

const LIMIT_LABEL = {
  none: "nenhum",
  cpu: "processador",
  bandwidth: "internet",
  other: "outro",
} as const;

/**
 * Painel de estatísticas da call: primeiro o que está segurando a imagem ou a
 * voz, em frase; embaixo os números de cada conexão. Atualiza a cada segundo
 * enquanto está aberto e copia tudo para colar numa conversa.
 */
export function CallStatsPanel({
  read,
  nameOf,
  onClose,
}: {
  read: () => Promise<RawPeerStats[]>;
  nameOf: (peerId: string) => string;
  onClose: () => void;
}) {
  const [peers, setPeers] = useState<PeerStats[] | null>(null);
  const readerRef = useRef(new CallStatsReader());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const raw = await read();
      if (alive) setPeers(readerRef.current.read(raw));
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [read]);

  const findings = peers ? diagnose(peers) : [];

  const copy = async () => {
    const payload = {
      at: new Date().toISOString(),
      agent: navigator.userAgent,
      app: typeof window !== "undefined" && !!window.clyroDesktop,
      findings: findings.map((f) => f.text),
      peers: (peers ?? []).map((p) => ({ ...p, name: nameOf(p.peerId) })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast.success("Estatísticas copiadas.");
    } catch {
      toast.error("Não deu para copiar.");
    }
  };

  return (
    <section
      aria-label="Estatísticas da call"
      className="clyro-fade-in absolute right-3 top-3 z-30 flex max-h-[calc(100%-24px)] w-[340px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#111214]/92 text-white shadow-2xl backdrop-blur-xl"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 pl-4 pr-1.5">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.01em]">Estatísticas da call</h2>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copiar estatísticas"
          title="Copiar estatísticas"
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Copy size={15} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar estatísticas"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={16} />
        </button>
      </header>

      <div className="clyro-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {peers === null ? (
          <p className="text-[12.5px] text-white/55">Lendo a conexão…</p>
        ) : peers.length === 0 ? (
          <p className="text-[12.5px] text-white/55">
            Ninguém mais na call: as estatísticas aparecem quando alguém entrar.
          </p>
        ) : (
          <>
            <ul className="space-y-1.5">
              {findings.map((f) => (
                <li key={f.text} className="flex gap-2 text-[12.5px] leading-[1.4]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-[5px] h-2 w-2 shrink-0 rounded-full",
                      f.tone === "ok" && "bg-online",
                      f.tone === "warn" && "bg-amber-400",
                      f.tone === "bad" && "bg-[#da373c]",
                    )}
                  />
                  <span className="text-white/85">{f.text}</span>
                </li>
              ))}
            </ul>

            {peers.map((p) => (
              <div key={p.peerId} className="mt-4 border-t border-white/10 pt-3">
                <h3 className="text-[12.5px] font-semibold">{nameOf(p.peerId)}</h3>
                <Rows
                  rows={[
                    ["Atraso (ida e volta)", p.rttMs === null ? "—" : `${p.rttMs} ms`],
                    ["Caminho", p.path],
                    ["Banda para enviar", p.sendBudgetKbps === null ? "—" : mbps(p.sendBudgetKbps)],
                  ]}
                />

                {p.sendVideo.map((v, i) => (
                  <Group
                    key={`s${i}`}
                    title={v.kind === "screen" ? "Sua tela, enviando" : "Sua câmera, enviando"}
                  >
                    <Rows
                      rows={[
                        ["Imagem", `${v.width}×${v.height} a ${v.fps} fps`],
                        ["Taxa", mbps(v.kbps)],
                        ["Limitada por", LIMIT_LABEL[v.limit] ?? v.limit],
                        ["Codec", `${v.codec} · ${hw(v.hardware)}`],
                      ]}
                    />
                  </Group>
                ))}

                {p.recvVideo.map((v, i) => (
                  <Group key={`r${i}`} title="Imagem chegando">
                    <Rows
                      rows={[
                        ["Imagem", `${v.width}×${v.height} a ${v.fps} fps`],
                        ["Taxa", mbps(v.kbps)],
                        ["Perda de pacotes", `${v.lossPct.toFixed(1)}%`],
                        ["Travadas", `${v.freezeTotal} (${v.frozenSeconds} s parada)`],
                        ["Quadros descartados", String(v.dropped)],
                        ["Folga de reprodução", `${v.bufferMs} ms`],
                        ["Codec", `${v.codec} · ${hw(v.hardware)}`],
                        ...(v.fecRecovered > 0
                          ? [["Pacotes de correção", String(v.fecRecovered)] as [string, string]]
                          : []),
                      ]}
                    />
                  </Group>
                ))}

                {p.recvAudio.map((a, i) => (
                  <Group key={`a${i}`} title={i === 0 ? "Voz chegando" : "Som da tela chegando"}>
                    <Rows
                      rows={[
                        ["Taxa", `${a.kbps} kbps`],
                        ["Perda de pacotes", `${a.lossPct.toFixed(1)}%`],
                        ["Variação (jitter)", `${a.jitterMs} ms`],
                        ["Folga de reprodução", `${a.bufferMs} ms`],
                        ["Som tapado", `${a.concealedPct.toFixed(1)}%`],
                      ]}
                    />
                  </Group>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <h4 className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/45">{title}</h4>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-1 space-y-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 text-[12px]">
          <dt className="text-white/55">{label}</dt>
          <dd className="truncate text-right tabular-nums text-white/90">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const mbps = (kbps: number) => (kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`);
const hw = (hardware: boolean | null) =>
  hardware === null ? "?" : hardware ? "placa de vídeo" : "software";
