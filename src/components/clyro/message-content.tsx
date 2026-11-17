import { Fragment } from "react";

/**
 * Um passe único sobre o texto: negrito, itálico, tachado, código, menções e
 * links. O split com grupo de captura devolve os separadores junto, então a
 * ordem do texto é preservada sem precisar de índices.
 */
const TOKEN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|@[\p{L}\p{N}_.-]+|https?:\/\/[^\s<]+)/gu;

/**
 * "thread" é o chat das salas, como sempre foi. Os balões das conversas pedem
 * cores próprias: "incoming" no balão branco, "outgoing" no laranja.
 */
type Tone = "thread" | "incoming" | "outgoing" | "stage";

const TONE: Record<Tone, { text: string; code: string; mention: string; link: string }> = {
  thread: {
    text: "text-[15px] leading-[1.6] text-foreground/90",
    code: "bg-secondary text-foreground",
    mention: "bg-brand/20 text-brand-soft",
    link: "text-brand-soft decoration-brand-soft/40 hover:decoration-brand-soft",
  },
  incoming: {
    text: "text-[14px] leading-[1.5] text-foreground",
    code: "bg-[#f4f4f5] text-foreground",
    mention: "bg-brand-soft text-[#9a3a00]",
    link: "text-[#c2410c] decoration-[#c2410c]/40 hover:decoration-[#c2410c]",
  },
  /* O chat ao lado da call: o balão branco, num tamanho menor. */
  stage: {
    text: "text-[13px] leading-[1.45] text-foreground",
    code: "bg-[#f4f4f5] text-foreground",
    mention: "bg-brand-soft text-[#9a3a00]",
    link: "text-[#c2410c] decoration-[#c2410c]/40 hover:decoration-[#c2410c]",
  },
  outgoing: {
    text: "text-[14px] leading-[1.5] text-white",
    code: "bg-white/15 text-white",
    mention: "bg-white/20 text-white",
    link: "text-white decoration-white/50 hover:decoration-white",
  },
};

export function MessageContent({ content, tone = "thread" }: { content: string; tone?: Tone }) {
  const parts = content.split(TOKEN).filter((part) => part !== "");
  const colors = TONE[tone];

  return (
    <p className={`whitespace-pre-wrap break-words ${colors.text}`}>
      {parts.map((part, index) => (
        <Fragment key={index}>{renderPart(part, colors)}</Fragment>
      ))}
    </p>
  );
}

function renderPart(part: string, colors: (typeof TONE)[Tone]) {
  if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
    return <strong className="font-semibold">{part.slice(2, -2)}</strong>;
  }
  if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
    return <s className="opacity-70">{part.slice(2, -2)}</s>;
  }
  if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
    return <em>{part.slice(1, -1)}</em>;
  }
  if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
    return (
      <code className={`rounded-md px-1.5 py-0.5 font-mono text-[13px] ${colors.code}`}>
        {part.slice(1, -1)}
      </code>
    );
  }
  if (part.startsWith("@") && part.length > 1) {
    return <span className={`rounded-md px-1.5 py-0.5 font-medium ${colors.mention}`}>{part}</span>;
  }
  if (part.startsWith("http://") || part.startsWith("https://")) {
    return (
      <a
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className={`underline underline-offset-2 transition-colors ${colors.link}`}
      >
        {part}
      </a>
    );
  }
  return part;
}
