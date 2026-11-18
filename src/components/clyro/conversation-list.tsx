import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowDown2,
  CloseCircle,
  MessageAdd,
  More,
  People,
  SearchNormal1,
  TickCircle,
  UserAdd,
} from "iconsax-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import { markConversationSeen, useRecentDirectMessages, useSeenMap } from "@/lib/dm-queries";
import type { Conversation, Message, Profile, Selection, Server } from "@/lib/clyro-types";
import { UserAvatar } from "./primitives";
import { conversationTitle, dedupeDirectConversations } from "./home-sidebar";
import { InvitePeopleDialog } from "./invite-people-dialog";

type Filter = "all" | "direct" | "groups" | "unread";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas as conversas" },
  { id: "direct", label: "Diretas" },
  { id: "groups", label: "Grupos" },
  { id: "unread", label: "Não lidas" },
];

const ICON_BUTTON =
  "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground outline-none transition-[background-color,color,transform] duration-200 ease-clyro hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand active:scale-95 data-[state=open]:bg-secondary data-[state=open]:text-foreground";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Hoje, a hora; ontem, "Ontem"; nesta semana, o dia; antes disso, a data. */
function listStamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Ontem";
  if (days < 7) return WEEKDAYS[date.getDay()];
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** A prévia não precisa dos marcadores de formatação. */
function plainText(content: string) {
  return content
    .replace(/\*\*|~~|`|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstName(p: Profile | undefined) {
  return (p?.display_name || p?.username || "Alguém").split(" ")[0];
}

/**
 * A coluna das conversas: o título com o filtro, a busca, a barra que chama
 * gente nova, os amigos e cada conversa com a última mensagem e a hora.
 */
export function ConversationList({
  conversations,
  selection,
  friendsActive,
  workspace,
  onSelect,
  onOpenDM,
  onOpenFriends,
  footer,
  className,
}: {
  conversations: Conversation[];
  selection: Selection;
  friendsActive: boolean;
  workspace: Server | null;
  onSelect: (selection: Selection) => void;
  onOpenDM: (userId: string) => void;
  onOpenFriends: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const list = useMemo(
    () => dedupeDirectConversations(conversations, user?.id),
    [conversations, user?.id],
  );
  const { data: recent } = useRecentDirectMessages(list.map((c) => c.id));
  const seen = useSeenMap();
  const activeId = selection.kind === "dm" ? selection.conversationId : null;

  /*
   * Na primeira vez que uma conversa aparece neste navegador, o que já estava
   * lá conta como lido; daí em diante, o que chegar depois vira o número.
   * A conversa aberta fica sempre em dia.
   */
  useEffect(() => {
    if (!recent) return;
    for (const c of list) {
      const latest = recent.get(c.id)?.[0];
      if (!latest) continue;
      if (!seen[c.id] || c.id === activeId) markConversationSeen(c.id, latest.created_at);
    }
  }, [recent, list, seen, activeId]);

  const rows = useMemo(() => {
    return list
      .map((c) => {
        const messages = recent?.get(c.id) ?? [];
        const last: Message | undefined = messages[0];
        const since = seen[c.id];
        const unread =
          since && c.id !== activeId
            ? messages.filter((m) => m.author_id !== user?.id && m.created_at > since).length
            : 0;
        return { conversation: c, last, unread };
      })
      .sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
  }, [list, recent, seen, activeId, user?.id]);

  const visible = rows.filter((r) =>
    filter === "direct"
      ? !r.conversation.is_group
      : filter === "groups"
        ? r.conversation.is_group
        : filter === "unread"
          ? r.unread > 0
          : true,
  );
  const countOf = (f: Filter) =>
    f === "all"
      ? rows.length
      : f === "direct"
        ? rows.filter((r) => !r.conversation.is_group).length
        : f === "groups"
          ? rows.filter((r) => r.conversation.is_group).length
          : rows.filter((r) => r.unread > 0).length;

  const term = query.trim().toLowerCase();
  /** A busca também acha gente com quem você nunca falou, para abrir a conversa. */
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
      conversations: rows.filter((r) =>
        conversationTitle(r.conversation, profiles, user?.id).toLowerCase().includes(term),
      ),
    };
  }, [profiles, rows, term, user?.id]);

  const friends = friendships
    .filter((f) => f.status === "accepted")
    .map((f) => profiles?.get(f.requester_id === user?.id ? f.addressee_id : f.requester_id))
    .filter((p): p is Profile => !!p);
  const pending = friendships.filter(
    (f) => f.status === "pending" && f.addressee_id === user?.id,
  ).length;
  const friendsOnline = friends.filter((p) => p.status === "online" || p.status === "dnd").length;

  const openSearch = () => {
    setSearching(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const closeSearch = () => {
    setQuery("");
    setSearching(false);
  };

  const openFirstResult = () => {
    if (!results) return;
    const first = results.conversations[0];
    if (first) onSelect({ kind: "dm", conversationId: first.conversation.id });
    else if (results.people[0]) onOpenDM(results.people[0].id);
  };

  const label = FILTERS.find((f) => f.id === filter)?.label ?? "";

  return (
    <div className={cn("flex min-h-0 flex-col bg-card", className)}>
      <header className="flex h-14 shrink-0 items-center gap-1 pl-4 pr-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group -ml-1.5 flex h-8 min-w-0 items-center gap-1.5 rounded-full px-1.5 text-[16px] font-semibold tracking-[-0.02em] outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="truncate">{filter === "all" ? "Conversas" : label}</span>
              <ArrowDown2
                size={13}
                color="currentColor"
                className="shrink-0 text-muted-foreground transition-transform duration-200 ease-clyro group-data-[state=open]:rotate-180"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={6} className="w-56 rounded-[16px] p-1.5">
            {FILTERS.map((f) => (
              <DropdownMenuItem
                key={f.id}
                onSelect={() => setFilter(f.id)}
                className={cn(
                  "h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]",
                  filter === f.id && "font-medium",
                )}
              >
                <span className="flex-1">{f.label}</span>
                <span className="tabular-nums text-muted-foreground">{countOf(f.id)}</span>
                {filter === f.id && (
                  <TickCircle size={15} color="var(--brand)" variant="Bold" className="shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            aria-label="Buscar conversas e pessoas"
            onClick={() => (searching ? closeSearch() : openSearch())}
            className={cn(ICON_BUTTON, searching && "bg-secondary text-foreground")}
          >
            <SearchNormal1 size={17} color="currentColor" />
          </button>
          <button
            type="button"
            aria-label="Nova conversa em grupo"
            onClick={() => setGroupOpen(true)}
            className={ICON_BUTTON}
          >
            <MessageAdd size={17} color="currentColor" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Mais opções" className={ICON_BUTTON}>
                <More size={17} color="currentColor" className="rotate-90" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-[16px] p-1.5">
              <DropdownMenuItem
                onSelect={onOpenFriends}
                className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]"
              >
                <People size={16} color="currentColor" /> Amigos e pedidos
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setGroupOpen(true)}
                className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]"
              >
                <MessageAdd size={16} color="currentColor" /> Nova conversa em grupo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setInviteOpen(true)}
                className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]"
              >
                <UserAdd size={16} color="currentColor" /> Encontrar e convidar pessoas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {(searching || query) && (
        <div className="clyro-fade-in relative mx-3 mb-2 shrink-0">
          <SearchNormal1
            size={15}
            color="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") openFirstResult();
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Buscar pessoas e conversas"
            aria-label="Buscar pessoas e conversas"
            className="h-9 w-full rounded-[12px] border border-foreground/[0.08] bg-card pl-9 pr-9 text-[13.5px] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-brand/50 focus:ring-2 focus:ring-brand/15"
          />
          <button
            type="button"
            aria-label="Fechar busca"
            onClick={closeSearch}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseCircle size={16} color="currentColor" variant="Bold" />
          </button>
        </div>
      )}

      {/* A barra cinza da referência: chamar gente que ainda não está aqui. */}
      {!results && (
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="group mx-3 mb-2 flex h-11 shrink-0 items-center gap-2.5 rounded-[12px] bg-secondary px-2 text-left text-[13.5px] font-medium tracking-[-0.01em] text-ink-2 outline-none transition-[background-color,transform] duration-200 ease-clyro hover:bg-secondary-hover focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
            <UserAdd size={15} color="currentColor" />
          </span>
          Encontre e convide pessoas
        </button>
      )}

      <div className="clyro-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {results ? (
          <div className="clyro-fade-in">
            {results.conversations.length + results.people.length === 0 && (
              <p className="px-3 py-4 text-[13px] text-muted-foreground">
                Nada encontrado para “{query.trim()}”.
              </p>
            )}
            {results.conversations.length > 0 && <GroupLabel>Conversas</GroupLabel>}
            {results.conversations.map((r) => (
              <ConversationRow
                key={r.conversation.id}
                {...r}
                profiles={profiles}
                selfId={user?.id}
                active={r.conversation.id === activeId}
                onClick={() => {
                  closeSearch();
                  onSelect({ kind: "dm", conversationId: r.conversation.id });
                }}
              />
            ))}
            {results.people.length > 0 && <GroupLabel>Pessoas</GroupLabel>}
            {results.people.map((person) => (
              <RowButton
                key={person.id}
                onClick={() => {
                  closeSearch();
                  onOpenDM(person.id);
                }}
              >
                <UserAvatar profile={person} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {person.display_name || person.username}
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    @{person.username}
                  </span>
                </span>
              </RowButton>
            ))}
          </div>
        ) : (
          <>
            <RowButton active={friendsActive} desktopOnly onClick={onOpenFriends}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                <People size={19} color="var(--brand)" variant="Bulk" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">Amigos</span>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {friends.length === 0
                    ? "Adicione pelo @ de alguém"
                    : `${friends.length} ${friends.length === 1 ? "amigo" : "amigos"} · ${friendsOnline} online`}
                </span>
              </span>
              {pending > 0 && <Count value={pending} label="pedidos de amizade" />}
            </RowButton>

            <div className="mx-3 my-1.5 h-px bg-foreground/[0.06]" />

            {visible.map((r) => (
              <ConversationRow
                key={r.conversation.id}
                {...r}
                profiles={profiles}
                selfId={user?.id}
                active={r.conversation.id === activeId}
                onClick={() => onSelect({ kind: "dm", conversationId: r.conversation.id })}
              />
            ))}

            {visible.length === 0 && (
              <p className="px-3 py-4 text-[13px] leading-[1.5] text-muted-foreground">
                {filter === "all"
                  ? "Nenhuma conversa ainda. Abra uma pelos Amigos ou busque alguém pelo nome."
                  : filter === "unread"
                    ? "Tudo lido por aqui."
                    : "Nada neste filtro."}
              </p>
            )}
          </>
        )}
      </div>

      {footer}

      <GroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        friends={friends}
        onCreated={(id) => onSelect({ kind: "dm", conversationId: id })}
      />
      <InvitePeopleDialog open={inviteOpen} onOpenChange={setInviteOpen} workspace={workspace} />
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-3 pb-1 pt-3 text-[12px] font-medium text-muted-foreground">{children}</h3>
  );
}

function RowButton({
  active = false,
  desktopOnly = false,
  onClick,
  children,
}: {
  active?: boolean;
  /** No celular a lista ocupa a tela sozinha: nada fica "aberto" ao lado. */
  desktopOnly?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left outline-none transition-colors duration-150 ease-clyro focus-visible:ring-2 focus-visible:ring-brand",
        !active
          ? "hover:bg-secondary"
          : desktopOnly
            ? "hover:bg-secondary md:bg-brand-soft md:hover:bg-brand-soft"
            : "bg-brand-soft",
      )}
    >
      {children}
    </button>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <span
      aria-label={`${value} ${label}`}
      className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-deep px-1.5 text-[11px] font-semibold tabular-nums text-white"
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

function ConversationRow({
  conversation,
  last,
  unread,
  profiles,
  selfId,
  active,
  onClick,
}: {
  conversation: Conversation;
  last: Message | undefined;
  unread: number;
  profiles: Map<string, Profile> | undefined;
  selfId: string | undefined;
  active: boolean;
  onClick: () => void;
}) {
  const others = conversation.member_ids.filter((id) => id !== selfId);
  const title = conversationTitle(conversation, profiles, selfId);
  const mine = last?.author_id === selfId;
  const who = mine
    ? "Você: "
    : conversation.is_group && last
      ? `${firstName(profiles?.get(last.author_id))}: `
      : "";

  return (
    <RowButton active={active} onClick={onClick}>
      {conversation.is_group ? (
        <GroupAvatar ids={others} profiles={profiles} />
      ) : (
        <UserAvatar profile={others[0] ? profiles?.get(others[0]) : undefined} size={40} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.01em]",
              active && "text-brand-ink",
            )}
          >
            {title}
          </span>
          {last && (
            <span
              className={cn(
                "shrink-0 text-[12px] tabular-nums",
                unread > 0 ? "font-medium text-brand-text" : "text-ink-faint",
              )}
            >
              {listStamp(last.created_at)}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {last ? (
              <>
                {who}
                {plainText(last.content)}
              </>
            ) : (
              "Nenhuma mensagem ainda"
            )}
          </span>
          {unread > 0 && <Count value={unread} label="mensagens novas" />}
        </span>
      </span>
    </RowButton>
  );
}

/** Dois rostos sobrepostos no lugar de um, para o grupo se ler como grupo. */
export function GroupAvatar({
  ids,
  profiles,
}: {
  ids: string[];
  profiles: Map<string, Profile> | undefined;
}) {
  const [a, b] = ids;
  return (
    <span className="relative h-10 w-10 shrink-0">
      <span className="absolute left-0 top-0">
        <UserAvatar profile={a ? profiles?.get(a) : undefined} size={28} showStatus={false} />
      </span>
      <span className="absolute bottom-0 right-0 rounded-full ring-2 ring-card">
        <UserAvatar profile={b ? profiles?.get(b) : undefined} size={28} showStatus={false} />
      </span>
    </span>
  );
}

function GroupDialog({
  open,
  onOpenChange,
  friends,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Profile[];
  onCreated: (conversationId: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const create = async () => {
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
    onOpenChange(false);
    setName("");
    setPicked([]);
    onCreated(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[24px]">
        <DialogHeader>
          <DialogTitle>Nova conversa em grupo</DialogTitle>
          <DialogDescription>Escolha os amigos que entram na conversa.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Nome (opcional)</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <ul className="clyro-scroll max-h-60 space-y-0.5 overflow-y-auto">
            {friends.map((friend) => {
              const on = picked.includes(friend.id);
              return (
                <li key={friend.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((prev) =>
                        on ? prev.filter((id) => id !== friend.id) : [...prev, friend.id],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-left transition-colors",
                      on ? "bg-brand-soft" : "hover:bg-secondary",
                    )}
                  >
                    <UserAvatar profile={friend} size={28} showStatus={false} />
                    <span className="flex-1 text-[14px]">
                      {friend.display_name || friend.username}
                    </span>
                    {on && <TickCircle size={16} color="var(--brand)" variant="Bold" />}
                  </button>
                </li>
              );
            })}
            {friends.length === 0 && (
              <li className="text-[13px] text-muted-foreground">Adicione amigos primeiro.</li>
            )}
          </ul>
          <Button
            className="w-full rounded-full"
            onClick={() => void create()}
            disabled={picked.length === 0}
          >
            Criar grupo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
