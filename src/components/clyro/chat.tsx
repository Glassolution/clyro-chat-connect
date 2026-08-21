import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SendHorizonal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMessages, useProfiles } from "@/lib/clyro-queries";
import { UserAvatar } from "./primitives";
import { cn } from "@/lib/utils";

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function ChatPanel({
  scopeKey,
  channelId,
  conversationId,
  header,
  placeholder,
}: {
  scopeKey: string;
  channelId?: string;
  conversationId?: string;
  header: ReactNode;
  placeholder: string;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: messages = [] } = useMessages({ channelId, conversationId });
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, scopeKey]);

  useEffect(() => {
    const channel = supabase.channel(`typing-${scopeKey}`, { config: { broadcast: { self: false } } });
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

  const typingNames = useMemo(
    () => Object.entries(typing).filter(([id]) => id !== user?.id).map(([, v]) => v.name),
    [typing, user?.id],
  );

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">{header}</header>

      <div className="flex-1 overflow-y-auto clyro-scroll px-5 py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
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
            new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
          return (
            <div key={message.id}>
              {newDay && (
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {dayOf(message.created_at)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className={cn("flex gap-3 rounded-lg px-2 py-0.5 hover:bg-muted/60", grouped ? "mt-0" : "mt-3")}>
                {grouped ? (
                  <span className="w-9 shrink-0" />
                ) : (
                  <UserAvatar profile={author} size={36} showStatus={false} />
                )}
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <p className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">
                        {author?.display_name || author?.username || "Usuário"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{timeOf(message.created_at)}</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                    {message.content}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-5 pb-5">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-panel">
          <textarea
            rows={1}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => {
              setDraft(e.target.value);
              notifyTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button size="icon" onClick={() => void send()} aria-label="Enviar mensagem">
            <SendHorizonal size={16} />
          </Button>
        </div>
        <p className="mt-1.5 h-4 px-1 text-xs text-muted-foreground">
          {typingNames.length > 0 &&
            `${typingNames.slice(0, 3).join(", ")} ${typingNames.length > 1 ? "estão" : "está"} digitando…`}
        </p>
      </div>
    </section>
  );
}
