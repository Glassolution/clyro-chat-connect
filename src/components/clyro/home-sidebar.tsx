import { Users, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import {
  initialsOf,
  type Conversation,
  type Profile,
  type Selection,
  type Server,
} from "@/lib/clyro-types";
import { UserAvatar } from "./primitives";

export function conversationTitle(
  conversation: Conversation,
  profiles: Map<string, Profile> | undefined,
  selfId: string | undefined,
) {
  if (conversation.name) return conversation.name;
  const others = conversation.member_ids.filter((id) => id !== selfId);
  const names = others.map((id) => {
    const p = profiles?.get(id);
    return p?.display_name || p?.username || "Usuário";
  });
  return names.join(", ") || "Conversa";
}

/**
 * A mesma pessoa podia aparecer várias vezes na lista quando mais de uma conversa
 * 1:1 foi criada com ela. Mantemos uma por interlocutor, sempre a de menor id, para
 * que a escolha não mude a cada carregamento (a query não define ordenação).
 */
export function dedupeDirectConversations(
  conversations: Conversation[],
  selfId: string | undefined,
) {
  const canonical = new Map<string, Conversation>();
  const groups: Conversation[] = [];

  for (const conversation of conversations) {
    const other =
      !conversation.is_group && conversation.member_ids.length === 2
        ? conversation.member_ids.find((id) => id !== selfId)
        : undefined;
    if (!other) {
      groups.push(conversation);
      continue;
    }
    const kept = canonical.get(other);
    if (!kept || conversation.id < kept.id) canonical.set(other, conversation);
  }

  return [...canonical.values(), ...groups];
}

export function HomeSidebar({
  conversations,
  servers,
  selection,
  onSelect,
  onOpenDM,
  onOpenServer,
  footer,
}: {
  conversations: Conversation[];
  servers: Server[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onOpenDM: (userId: string) => void;
  onOpenServer: (serverId: string) => void;
  footer: React.ReactNode;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const directList = useMemo(
    () => dedupeDirectConversations(conversations, user?.id),
    [conversations, user?.id],
  );

  /**
   * A busca não olha só as conversas já abertas: procura pessoas pelo nome de
   * usuário, para que dê para abrir o chat com alguém com quem nunca se falou.
   */
  const results = useMemo(() => {
    if (!term) return null;
    const people = [...(profiles?.values() ?? [])]
      .filter(
        (p) =>
          p.id !== user?.id && `${p.display_name ?? ""} ${p.username}`.toLowerCase().includes(term),
      )
      .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username))
      .slice(0, 12);
    return {
      people,
      conversations: directList.filter((c) =>
        conversationTitle(c, profiles, user?.id).toLowerCase().includes(term),
      ),
      servers: servers.filter((s) => s.name.toLowerCase().includes(term)),
    };
  }, [directList, profiles, servers, term, user?.id]);

  const openFirstResult = () => {
    if (!results) return;
    const first = results.conversations[0];
    if (first) {
      onSelect({ kind: "dm", conversationId: first.id });
      return;
    }
    if (results.people[0]) {
      onOpenDM(results.people[0].id);
      return;
    }
    if (results.servers[0]) onOpenServer(results.servers[0].id);
  };

  const friends = friendships
    .filter((f) => f.status === "accepted")
    .map((f) => profiles?.get(f.requester_id === user?.id ? f.addressee_id : f.requester_id))
    .filter((p): p is Profile => !!p);

  const createGroup = async () => {
    if (!user || picked.length === 0) return;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ is_group: true, name: name.trim() || null, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível criar o grupo.");
      return;
    }
    await supabase
      .from("conversation_members")
      .insert([user.id, ...picked].map((id) => ({ conversation_id: data.id, user_id: id })));
    setOpen(false);
    setName("");
    setPicked([]);
    onSelect({ kind: "dm", conversationId: data.id });
  };

  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
        <div className="relative w-full">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") openFirstResult();
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Buscar pessoas e conversas"
            aria-label="Buscar pessoas e conversas"
            className="h-8 w-full rounded-lg bg-rail pl-8 pr-8 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {results ? (
        <div className="clyro-fade-in flex-1 overflow-y-auto clyro-scroll px-2 pb-2 pt-2">
          {results.conversations.length + results.people.length + results.servers.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Nada encontrado para “{query.trim()}”.
            </p>
          )}

          <ResultGroup label="Conversas" count={results.conversations.length}>
            {results.conversations.map((conversation) => {
              const others = conversation.member_ids.filter((id) => id !== user?.id);
              const single =
                !conversation.is_group && others[0] ? profiles?.get(others[0]) : undefined;
              return (
                <ResultRow
                  key={conversation.id}
                  avatar={
                    <UserAvatar profile={single} size={30} showStatus={!conversation.is_group} />
                  }
                  title={conversationTitle(conversation, profiles, user?.id)}
                  term={term}
                  onClick={() => onSelect({ kind: "dm", conversationId: conversation.id })}
                />
              );
            })}
          </ResultGroup>

          <ResultGroup label="Pessoas" count={results.people.length}>
            {results.people.map((person) => (
              <ResultRow
                key={person.id}
                avatar={<UserAvatar profile={person} size={30} />}
                title={person.display_name || person.username}
                subtitle={`@${person.username}`}
                term={term}
                onClick={() => onOpenDM(person.id)}
              />
            ))}
          </ResultGroup>

          <ResultGroup label="Servidores" count={results.servers.length}>
            {results.servers.map((server) => (
              <ResultRow
                key={server.id}
                avatar={
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-secondary text-[11px] font-semibold">
                    {initialsOf(server.name)}
                  </span>
                }
                title={server.name}
                term={term}
                onClick={() => onOpenServer(server.id)}
              />
            ))}
          </ResultGroup>
        </div>
      ) : (
        <>
          <div className="p-2">
            <button
              type="button"
              onClick={() => onSelect({ kind: "friends" })}
              className={cn(
                "flex w-full items-center gap-3 rounded px-2 py-1.5 text-[15px] font-medium text-muted-foreground transition-colors duration-100 hover:bg-[var(--color-muted)] hover:text-foreground",
                selection.kind === "friends" && "bg-accent text-foreground",
              )}
            >
              <Users size={16} /> Amigos
            </button>
          </div>
          <div className="flex items-center justify-between px-3 pb-1 pt-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">
              Mensagens diretas — {directList.length}
            </span>
            <button
              type="button"
              aria-label="Nova conversa em grupo"
              onClick={() => setOpen(true)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus size={14} />
            </button>
          </div>
          <ul className="flex-1 space-y-0.5 overflow-y-auto clyro-scroll px-2 pb-2">
            {directList.map((conversation) => {
              const others = conversation.member_ids.filter((id) => id !== user?.id);
              const single =
                !conversation.is_group && others[0] ? profiles?.get(others[0]) : undefined;
              const active =
                selection.kind === "dm" && selection.conversationId === conversation.id;
              return (
                <li key={conversation.id} className="clyro-fade-in">
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: "dm", conversationId: conversation.id })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors duration-100 hover:bg-[var(--color-muted)]",
                      active && "bg-accent",
                    )}
                  >
                    <UserAvatar profile={single} size={32} showStatus={!conversation.is_group} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[15px] font-medium",
                        active ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {conversationTitle(conversation, profiles, user?.id)}
                    </span>
                  </button>
                </li>
              );
            })}
            {directList.length === 0 && (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                Nenhuma conversa ainda. Comece por Amigos.
              </li>
            )}
          </ul>
        </>
      )}
      {footer}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa em grupo</DialogTitle>
            <DialogDescription>Selecione amigos para conversar juntos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nome (opcional)</Label>
              <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <ul className="max-h-60 space-y-1 overflow-y-auto clyro-scroll">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(friend.id)
                          ? prev.filter((id) => id !== friend.id)
                          : [...prev, friend.id],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent",
                      picked.includes(friend.id) && "bg-accent",
                    )}
                  >
                    <UserAvatar profile={friend} size={28} showStatus={false} />
                    <span className="text-sm">{friend.display_name || friend.username}</span>
                  </button>
                </li>
              ))}
              {friends.length === 0 && (
                <li className="text-sm text-muted-foreground">Adicione amigos primeiro.</li>
              )}
            </ul>
            <Button
              className="w-full"
              onClick={() => void createGroup()}
              disabled={picked.length === 0}
            >
              Criar grupo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="pb-2">
      <h3 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label} — {count}
      </h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function ResultRow({
  avatar,
  title,
  subtitle,
  term,
  onClick,
}: {
  avatar: React.ReactNode;
  title: string;
  subtitle?: string;
  term: string;
  onClick: () => void;
}) {
  return (
    <li className="clyro-fade-in">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{highlight(title, term)}</span>
          {subtitle && (
            <span className="block truncate text-xs text-muted-foreground">
              {highlight(subtitle, term)}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Destaca o trecho buscado dentro do texto, como no resultado de uma busca. */
function highlight(text: string, term: string) {
  if (!term) return text;
  const at = text.toLowerCase().indexOf(term);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-foreground/20 text-foreground">
        {text.slice(at, at + term.length)}
      </mark>
      {text.slice(at + term.length)}
    </>
  );
}
