import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AtSign, Bold, Italic, SendHorizonal, Smile, Strikethrough, Code } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useMessages, useProfiles } from "@/lib/clyro-queries";
import { UserAvatar } from "./primitives";
import { MessageContent } from "./message-content";
import { cn } from "@/lib/utils";

const EMOJIS = [
  "👍",
  "🎉",
  "🔥",
  "👏",
  "😄",
  "🙏",
  "🚀",
  "💡",
  "✅",
  "👀",
  "❤️",
  "😅",
  "🤔",
  "🥲",
  "⚡",
  "📌",
];

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Hoje mostra só a hora; qualquer outro dia leva a data junto. */
function stampOf(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
  if (sameDay) return `hoje às ${shortTime(iso)}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}, ${shortTime(iso)}`;
}

export function ChatPanel({
  scopeKey,
  channelId,
  conversationId,
  header,
  placeholder,
}: {
  scopeKey: string;
  channelId?: string | undefined;
  conversationId?: string | undefined;
  header: ReactNode;
  placeholder: string;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: messages = [] } = useMessages({ channelId, conversationId });
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, scopeKey]);

  useEffect(() => {
    const channel = supabase.channel(`typing-${scopeKey}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as { userId: string; name: string };
        setTyping((prev) => ({ ...prev, [data.userId]: { name: data.name, at: Date.now() } }));
      })
      .subscribe();
    typingChannel.current = channel;
    const interval = window.setInterval(() => {
      setTyping((prev) => {
        const next: typeof prev = {};
        Object.entries(prev).forEach(([id, value]) => {
          if (Date.now() - value.at < 4000) next[id] = value;
        });
        return next;
      });
    }, 1500);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
      typingChannel.current = null;
      setTyping({});
    };
  }, [scopeKey]);

  const notifyTyping = () => {
    if (!user) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1800) return;
    lastTypingSent.current = now;
    const me = profiles?.get(user.id);
    void typingChannel.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: user.id, name: me?.display_name || me?.username || "Alguém" },
    });
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || !user) return;
    setDraft("");
    await supabase.from("messages").insert({
      content,
      author_id: user.id,
      channel_id: channelId ?? null,
      conversation_id: conversationId ?? null,
    });
  };

  /**
   * Envolve o trecho selecionado (ou insere o par vazio no cursor) e devolve o
   * foco com a seleção certa — sem isso, formatar duas vezes seguidas é
   * impossível.
   */
  const wrapSelection = (before: string, after = before) => {
    const input = inputRef.current;
    if (!input) return;
    const { selectionStart: start, selectionEnd: end } = input;
    const selected = draft.slice(start, end);
    const next = `${draft.slice(0, start)}${before}${selected}${after}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const insertAtCursor = (text: string) => {
    const input = inputRef.current;
    if (!input) {
      setDraft((value) => value + text);
      return;
    }
    const { selectionStart: start, selectionEnd: end } = input;
    const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const typingNames = useMemo(
    () =>
      Object.entries(typing)
        .filter(([id]) => id !== user?.id)
        .map(([, v]) => v.name),
    [typing, user?.id],
  );

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        {header}
      </header>

      <div className="clyro-scroll flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda. Diga oi.
          </p>
        )}

        {messages.map((message, index) => {
          const author = profiles?.get(message.author_id);
          const prev = messages[index - 1];
          const newDay = !prev || dayOf(prev.created_at) !== dayOf(message.created_at);
          const grouped =
            !newDay &&
            prev?.author_id === message.author_id &&
            new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() <
              5 * 60 * 1000;

          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-6 flex items-center gap-4">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {dayOf(message.created_at)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}

              {/*
                A linha sangra para as bordas do painel para o realce do hover
                atravessar a largura toda, como no Discord.
              */}
              <div
                className={cn(
                  "group/msg -mx-6 flex gap-4 px-6 py-0.5 transition-colors duration-100 hover:bg-[var(--color-muted)]",
                  grouped ? "mt-0" : "mt-4",
                )}
              >
                {grouped ? (
                  <span className="w-10 shrink-0 pt-1 text-right text-[10px] leading-[1.6] text-muted-foreground opacity-0 transition-opacity duration-100 group-hover/msg:opacity-100">
                    {shortTime(message.created_at)}
                  </span>
                ) : (
                  <UserAvatar
                    profile={author}
                    size={40}
                    showStatus={false}
                    className="mt-0.5 shrink-0"
                  />
                )}

                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="flex items-baseline gap-2">
                      <span className="text-[15px] font-medium">
                        {author?.display_name || author?.username || "Usuário"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {stampOf(message.created_at)}
                      </span>
                    </p>
                  )}
                  <MessageContent content={message.content} />
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-6 pb-6">
        <div className="flex items-end gap-2 rounded-lg bg-input px-4 py-2.5">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => {
              setDraft(event.target.value);
              notifyTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className="clyro-scroll max-h-44 flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          {/* tudo aqui mexe no texto de verdade — nada é enfeite */}
          <div className="flex shrink-0 items-center gap-0.5 pb-1">
            <ToolButton label="Negrito" onClick={() => wrapSelection("**")}>
              <Bold size={17} />
            </ToolButton>
            <ToolButton label="Itálico" onClick={() => wrapSelection("*")}>
              <Italic size={17} />
            </ToolButton>
            <ToolButton label="Tachado" onClick={() => wrapSelection("~~")}>
              <Strikethrough size={17} />
            </ToolButton>
            <ToolButton label="Código" onClick={() => wrapSelection("`")}>
              <Code size={17} />
            </ToolButton>
            <ToolButton label="Mencionar alguém" onClick={() => insertAtCursor("@")}>
              <AtSign size={17} />
            </ToolButton>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Emoji"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
                >
                  <Smile size={17} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertAtCursor(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-base transition-transform duration-150 hover:scale-110 hover:bg-accent"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={() => void send()}
              disabled={!draft.trim()}
              aria-label="Enviar mensagem"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground transition-[opacity,transform] duration-200 ease-clyro hover:opacity-90 active:scale-95 disabled:opacity-25"
            >
              <SendHorizonal size={15} />
            </button>
          </div>
        </div>

        <p className="mt-2 h-4 px-1 text-xs text-muted-foreground">
          {typingNames.length > 0 &&
            `${typingNames.slice(0, 3).join(", ")} ${typingNames.length > 1 ? "estão" : "está"} digitando…`}
        </p>
      </div>
    </section>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
