import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AtSign,
  Bold,
  Italic,
  SendHorizonal,
  Smile,
  Strikethrough,
  Code,
} from "@/components/icons";
import { EmojiHappy, Send2, TextBold } from "iconsax-react";
import { supabase } from "@/integrations/supabase/client";
import type { Message, Profile } from "@/lib/clyro-types";
import { Mascot } from "@/components/workspace/mascot";
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

/** "Hoje", "Ontem" ou a data por extenso, na pílula entre os dias. */
function dayPill(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/**
 * O chat das salas ("thread", em linhas, como no Discord) e o das conversas
 * diretas ("bubbles", em balões). Os dois dividem a busca das mensagens, o
 * envio, o "digitando…" e a formatação; muda só o desenho.
 */
export function ChatPanel({
  scopeKey,
  channelId,
  conversationId,
  header,
  placeholder,
  variant = "thread",
  showAuthors = false,
}: {
  scopeKey: string;
  channelId?: string | undefined;
  conversationId?: string | undefined;
  /** Uma função recebe quem está digitando, para o cabeçalho mostrar. */
  header: ReactNode | ((typing: string[]) => ReactNode);
  placeholder: string;
  /** "stage" é o chat compacto no card ao lado da call. */
  variant?: "thread" | "bubbles" | "stage";
  /** Nos balões, o nome de quem escreveu (só faz sentido em grupo). */
  showAuthors?: boolean;
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

  const headerContent = typeof header === "function" ? header(typingNames) : header;

  if (variant === "stage") {
    return (
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div className="clyro-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
              <Mascot pose="brincando" size={56} />
              <p className="text-[13px] font-medium">Ninguém escreveu ainda</p>
              <p className="text-[12px] text-muted-foreground">
                Links e recados da call ficam aqui.
              </p>
            </div>
          ) : (
            <StageThread messages={messages} profiles={profiles} selfId={user?.id} />
          )}
          {typingNames.length > 0 && (
            <p className="clyro-fade-in mt-3 text-[12px] text-muted-foreground" aria-live="polite">
              {typingNames.join(", ")} {typingNames.length > 1 ? "estão" : "está"} digitando…
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex shrink-0 items-end gap-2 border-t border-foreground/[0.06] p-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            placeholder={placeholder}
            aria-label={placeholder}
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
            className="clyro-scroll max-h-28 min-h-10 flex-1 resize-none rounded-[12px] border border-foreground/[0.09] bg-card px-3 py-2.5 text-[13px] leading-[1.4] outline-none transition-[border-color,box-shadow] placeholder:text-ink-faint focus:border-brand/50 focus:shadow-[0_0_0_3px_rgb(255_106_19/0.12)]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim()}
            aria-label="Enviar mensagem"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-[background-color,opacity,transform] duration-200 ease-clyro hover:bg-brand-strong active:scale-95 disabled:opacity-40"
          >
            <Send2 size={17} color="currentColor" variant="Bold" />
          </button>
        </div>
      </section>
    );
  }

  if (variant === "bubbles") {
    return (
      <section className="flex h-full min-w-0 flex-1 flex-col bg-surface-1">
        {headerContent != null && (
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-foreground/[0.06] bg-card px-3 sm:px-5">
            {headerContent}
          </header>
        )}

        <div className="clyro-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
              <Mascot pose="brincando" size={72} />
              <p className="text-[14px] font-medium">Nenhuma mensagem ainda</p>
              <p className="-mt-2 text-[13px] text-muted-foreground">Comece com um oi.</p>
            </div>
          ) : (
            <BubbleThread
              messages={messages}
              profiles={profiles}
              selfId={user?.id}
              showAuthors={showAuthors}
            />
          )}
          {typingNames.length > 0 && (
            <div className="clyro-fade-in mt-3 flex items-center gap-2" aria-live="polite">
              <span className="flex h-8 items-center gap-1 rounded-[16px] rounded-bl-[6px] border border-foreground/[0.07] bg-card px-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-ghost"
                    style={{ animationDelay: `${i * 180}ms` }}
                  />
                ))}
              </span>
              <span className="sr-only">
                {typingNames.join(", ")} {typingNames.length > 1 ? "estão" : "está"} digitando
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 px-3 pb-3 sm:px-6 sm:pb-5">
          <div className="flex items-end gap-1 rounded-[16px] border border-foreground/[0.08] bg-card p-1.5 pl-3.5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-10px_rgb(0_0_0/0.12)] transition-[border-color,box-shadow] focus-within:border-brand/40 focus-within:shadow-[0_0_0_3px_rgb(255_106_19/0.12)]">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder={placeholder}
              aria-label={placeholder}
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
              className="clyro-scroll max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14px] leading-[1.45] outline-none placeholder:text-ink-faint"
            />

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Formatar texto" className={COMPOSER_ICON}>
                  <TextBold size={18} color="currentColor" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="flex w-auto gap-0.5 rounded-[14px] p-1"
              >
                <ToolButton label="Negrito" onClick={() => wrapSelection("**")}>
                  <Bold size={16} />
                </ToolButton>
                <ToolButton label="Itálico" onClick={() => wrapSelection("*")}>
                  <Italic size={16} />
                </ToolButton>
                <ToolButton label="Tachado" onClick={() => wrapSelection("~~")}>
                  <Strikethrough size={16} />
                </ToolButton>
                <ToolButton label="Código" onClick={() => wrapSelection("`")}>
                  <Code size={16} />
                </ToolButton>
                <ToolButton label="Mencionar alguém" onClick={() => insertAtCursor("@")}>
                  <AtSign size={16} />
                </ToolButton>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Emoji" className={COMPOSER_ICON}>
                  <EmojiHappy size={18} color="currentColor" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-auto rounded-[14px] p-2">
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
              className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-brand text-white transition-[background-color,opacity,transform] duration-200 ease-clyro hover:bg-brand-strong active:scale-95 disabled:opacity-40"
            >
              <Send2 size={17} color="currentColor" variant="Bold" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-6">
        {headerContent}
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

const COMPOSER_ICON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-ink-faint outline-none transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-secondary data-[state=open]:text-foreground";

/**
 * Os balões: os seus à direita, em laranja; os dos outros à esquerda, em
 * branco. Mensagens seguidas da mesma pessoa em até 5 minutos formam um bloco,
 * com o rosto e a hora só uma vez.
 */
/**
 * O chat da call: nome e foto em cima, o balão logo abaixo e a hora ao lado,
 * no card claro ao lado da call. As suas mensagens vão à direita, em laranja.
 */
function StageThread({
  messages,
  profiles,
  selfId,
}: {
  messages: Message[];
  profiles: Map<string, Profile> | undefined;
  selfId: string | undefined;
}) {
  const sameBlock = (a: Message | undefined, b: Message | undefined) =>
    !!a &&
    !!b &&
    a.author_id === b.author_id &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60 * 1000;

  return (
    <>
      {messages.map((message, index) => {
        const prev = messages[index - 1];
        const next = messages[index + 1];
        const first = !sameBlock(prev, message);
        const last = !sameBlock(message, next);
        const mine = message.author_id === selfId;
        const author = profiles?.get(message.author_id);
        const name = mine ? "Você" : author?.display_name || author?.username || "Usuário";

        return (
          <div key={message.id} className={first ? "mt-4" : "mt-1"}>
            {first && (
              <div className={cn("mb-1.5 flex items-center gap-2", mine && "flex-row-reverse")}>
                <UserAvatar profile={author} size={22} showStatus={false} />
                <span className="truncate text-[12.5px] font-medium">{name}</span>
              </div>
            )}
            <div
              className={cn(
                "flex items-end gap-2",
                mine ? "flex-row-reverse pr-[30px]" : "pl-[30px]",
              )}
            >
              <div
                className={cn(
                  "min-w-0 max-w-[82%] rounded-[12px] px-3 py-2",
                  mine ? "bg-brand-deep" : "border border-foreground/[0.06] bg-card",
                )}
              >
                <MessageContent content={message.content} tone={mine ? "outgoing" : "stage"} />
              </div>
              {last && (
                <span className="shrink-0 pb-0.5 text-[10.5px] tabular-nums text-ink-faint">
                  {shortTime(message.created_at)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function BubbleThread({
  messages,
  profiles,
  selfId,
  showAuthors,
}: {
  messages: Message[];
  profiles: Map<string, Profile> | undefined;
  selfId: string | undefined;
  showAuthors: boolean;
}) {
  const sameBlock = (a: Message | undefined, b: Message | undefined) =>
    !!a &&
    !!b &&
    a.author_id === b.author_id &&
    dayOf(a.created_at) === dayOf(b.created_at) &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60 * 1000;

  return (
    <>
      {messages.map((message, index) => {
        const prev = messages[index - 1];
        const next = messages[index + 1];
        const newDay = !prev || dayOf(prev.created_at) !== dayOf(message.created_at);
        const first = !sameBlock(prev, message);
        const last = !sameBlock(message, next);
        const mine = message.author_id === selfId;
        const author = profiles?.get(message.author_id);

        return (
          <div key={message.id}>
            {newDay && (
              <div className="my-4 flex justify-center">
                <span className="rounded-full border border-foreground/[0.07] bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground">
                  {dayPill(message.created_at)}
                </span>
              </div>
            )}

            <div
              className={cn(
                "flex items-end gap-2",
                mine ? "justify-end" : "justify-start",
                first ? "mt-3" : "mt-1",
              )}
            >
              {!mine && (
                <span className="w-7 shrink-0">
                  {last && <UserAvatar profile={author} size={28} showStatus={false} />}
                </span>
              )}
              <div
                className={cn(
                  "flex min-w-0 max-w-[78%] flex-col sm:max-w-[68%]",
                  mine ? "items-end" : "items-start",
                )}
              >
                {first && !mine && showAuthors && (
                  <span className="mb-1 px-1 text-[12px] font-medium text-muted-foreground">
                    {author?.display_name || author?.username || "Usuário"}
                  </span>
                )}
                <div
                  className={cn(
                    "rounded-[18px] px-3.5 py-2",
                    mine
                      ? "bg-brand-deep text-white"
                      : "border border-foreground/[0.07] bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]",
                    mine && !last && "rounded-br-[6px]",
                    mine && !first && "rounded-tr-[6px]",
                    !mine && !last && "rounded-bl-[6px]",
                    !mine && !first && "rounded-tl-[6px]",
                  )}
                >
                  <MessageContent content={message.content} tone={mine ? "outgoing" : "incoming"} />
                </div>
                {last && (
                  <span className="mt-1 px-1 text-[11px] tabular-nums text-ink-faint">
                    {shortTime(message.created_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
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
