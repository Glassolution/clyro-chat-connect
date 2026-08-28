import { Fragment } from "react";

/**
 * Um passe único sobre o texto: negrito, itálico, tachado, código, menções e
 * links. O split com grupo de captura devolve os separadores junto, então a
 * ordem do texto é preservada sem precisar de índices.
 */
const TOKEN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|~~[^~\n]+~~|`[^`\n]+`|@[\p{L}\p{N}_.-]+|https?:\/\/[^\s<]+)/gu;

export function MessageContent({ content }: { content: string }) {
  const parts = content.split(TOKEN).filter((part) => part !== "");

  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-foreground/90">
      {parts.map((part, index) => (
        <Fragment key={index}>{renderPart(part)}</Fragment>
      ))}
    </p>
  );
}

function renderPart(part: string) {
  if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
    return <strong className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
  }
  if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
    return <s className="opacity-70">{part.slice(2, -2)}</s>;
  }
  if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
    return <em>{part.slice(1, -1)}</em>;
  }
  if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
    return (
      <code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[13px] text-foreground">
        {part.slice(1, -1)}
      </code>
    );
  }
  if (part.startsWith("@") && part.length > 1) {
    return (
      <span className="rounded-md bg-brand/20 px-1.5 py-0.5 font-medium text-brand-soft">
        {part}
      </span>
    );
  }
  if (part.startsWith("http://") || part.startsWith("https://")) {
    return (
      <a
        href={part}
        target="_blank"
        rel="noreferrer noopener"
        className="text-brand-soft underline decoration-brand-soft/40 underline-offset-2 transition-colors hover:decoration-brand-soft"
      >
        {part}
      </a>
    );
  }
  return part;
}
