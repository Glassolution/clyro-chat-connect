import { useMemo, useState } from "react";
import { Check, Phone, Search, Send, UserPlus, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import { STATUS_LABEL, type Friendship, type Profile } from "@/lib/clyro-types";
import { ClyroMark, StatusDot, UserAvatar } from "./primitives";

export function FriendsPanel({
  onOpenDM,
  onSelectProfile,
  onCall,
}: {
  onOpenDM: (friendId: string) => void;
  onSelectProfile: (friendId: string) => void;
  onCall: (friendId: string, video: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState("online");
  const [query, setQuery] = useState("");

  const accepted = useMemo(() => friendships.filter((f) => f.status === "accepted"), [friendships]);
  const incoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === user?.id),
    [friendships, user?.id],
  );
  const outgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === user?.id),
    [friendships, user?.id],
  );

  const otherId = (f: Friendship) =>
    f.requester_id === user?.id ? f.addressee_id : f.requester_id;
  const friendProfiles = accepted
    .map((f) => profiles?.get(otherId(f)))
    .filter((p): p is Profile => !!p);
  const onlineFriends = friendProfiles.filter((p) => p.status !== "invisible");

  const search = (list: Profile[]) => {
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((p) => `${p.display_name ?? ""} ${p.username}`.toLowerCase().includes(term));
  };

  const addFriend = async () => {
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!handle || !user) return;
    const { data: matches } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .or(`username.eq.${handle},username.ilike.${handle}%,display_name.ilike.${handle}`)
      .limit(5);
    const data =
      matches?.find((p) => p.username.toLowerCase() === handle) ??
      matches?.find((p) => (p.display_name ?? "").toLowerCase() === handle) ??
      matches?.[0];
    if (!data) {
      toast.error("Usuário não encontrado.");
      return;
    }
    if (data.id === user.id) {
      toast.error("Esse é você.");
      return;
    }
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: data.id });
    if (error) {
      toast.error("Pedido já existe ou não pôde ser enviado.");
      return;
    }
    setUsername("");
    toast.success("Pedido de amizade enviado.");
  };

  const respond = async (id: string, status: "accepted" | "reject") => {
    if (status === "reject") await supabase.from("friendships").delete().eq("id", id);
    else await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
  };

  return (
    <section className="clyro-fade-in flex min-h-0 flex-1 flex-col bg-surface">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Users size={16} />
          <span className="text-sm font-semibold">Amigos</span>
          <span className="h-5 w-px shrink-0 bg-border" />
          <TabsList className="h-8 gap-1 bg-transparent p-0">
            <TabsTrigger value="online" className="data-[state=active]:bg-accent">
              Online
            </TabsTrigger>
            <TabsTrigger value="all" className="data-[state=active]:bg-accent">
              Todos
            </TabsTrigger>
            <TabsTrigger value="pending" className="data-[state=active]:bg-accent">
              Pendentes{incoming.length ? ` (${incoming.length})` : ""}
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            variant={tab === "add" ? "default" : "secondary"}
            className="ml-auto"
            onClick={() => setTab("add")}
          >
            <UserPlus size={14} /> Adicionar amigo
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto clyro-scroll">
          <TabsContent value="online" className="mt-0 px-4 pb-8 pt-4">
            <SearchField value={query} onChange={setQuery} />
            <Grid
              title={`Online — ${search(onlineFriends).length}`}
              profiles={search(onlineFriends)}
              onOpenDM={onOpenDM}
              onSelectProfile={onSelectProfile}
              onCall={onCall}
              empty={{
                title: "Ninguém online agora",
                body: "Quando alguém da sua lista ficar disponível, aparece aqui.",
              }}
            />
          </TabsContent>

          <TabsContent value="all" className="mt-0 px-4 pb-8 pt-4">
            <SearchField value={query} onChange={setQuery} />
            <Grid
              title={`Todos os amigos — ${search(friendProfiles).length}`}
              profiles={search(friendProfiles)}
              onOpenDM={onOpenDM}
              onSelectProfile={onSelectProfile}
              onCall={onCall}
              empty={{
                title: "Sua lista está vazia",
                body: "Use “Adicionar amigo” e mande um pedido pelo nome de usuário.",
                action: () => setTab("add"),
              }}
            />
          </TabsContent>

          <TabsContent value="pending" className="mt-0 space-y-8 px-4 pb-8 pt-4">
            <section>
              <SectionTitle>Recebidos — {incoming.length}</SectionTitle>
              {incoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido novo.</p>
              ) : (
                <PeopleList>
                  {incoming.map((f, index) => (
                    <PersonRow
                      key={f.id}
                      profile={profiles?.get(f.requester_id)}
                      index={index}
                      caption="Quer ser seu amigo"
                      onSelectProfile={onSelectProfile}
                      actions={
                        <>
                          <RowAction label="Aceitar" onClick={() => void respond(f.id, "accepted")}>
                            <Check size={15} />
                          </RowAction>
                          <RowAction label="Recusar" onClick={() => void respond(f.id, "reject")}>
                            <X size={15} />
                          </RowAction>
                        </>
                      }
                    />
                  ))}
                </PeopleList>
              )}
            </section>

            <section>
              <SectionTitle>Enviados — {outgoing.length}</SectionTitle>
              {outgoing.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido aguardando.</p>
              ) : (
                <PeopleList>
                  {outgoing.map((f, index) => (
                    <PersonRow
                      key={f.id}
                      profile={profiles?.get(f.addressee_id)}
                      index={index}
                      caption="Aguardando resposta"
                      onSelectProfile={onSelectProfile}
                      actions={
                        <RowAction
                          label="Cancelar pedido"
                          onClick={() => void respond(f.id, "reject")}
                        >
                          <X size={15} />
                        </RowAction>
                      }
                    />
                  ))}
                </PeopleList>
              )}
            </section>
          </TabsContent>

          <TabsContent value="add" className="mt-0 px-4 pb-8 pt-4">
            <div className="max-w-xl">
              <h2 className="text-sm font-semibold">Adicionar amigo</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use o nome de usuário do Clyro, sem espaços.
              </p>
              <div className="mt-4 flex gap-2">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@nomedeusuario"
                  onKeyDown={(e) => e.key === "Enter" && void addFriend()}
                />
                <Button onClick={() => void addFriend()} disabled={!username.trim()}>
                  <UserPlus size={16} /> Enviar
                </Button>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative mb-6">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar"
        aria-label="Buscar amigos"
        className="h-10 w-full rounded-xl border border-border bg-panel pl-9 pr-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground focus:border-foreground/25 focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h2>
  );
}

function PeopleList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border/70 border-y border-border/70">{children}</ul>;
}

function Grid({
  title,
  profiles,
  onOpenDM,
  onSelectProfile,
  onCall,
  empty,
}: {
  title: string;
  profiles: Profile[];
  onOpenDM: (id: string) => void;
  onSelectProfile: (id: string) => void;
  onCall: (id: string, video: boolean) => void;
  empty: { title: string; body: string; action?: (() => void) | undefined };
}) {
  if (profiles.length === 0) return <EmptyState {...empty} />;

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <PeopleList>
        {profiles.map((profile, index) => (
          <PersonRow
            key={profile.id}
            profile={profile}
            index={index}
            caption={profile.activity || STATUS_LABEL[profile.status]}
            onSelectProfile={onSelectProfile}
            actions={
              <>
                <RowAction label="Mensagem" onClick={() => onOpenDM(profile.id)}>
                  <Send size={15} />
                </RowAction>
                <RowAction label="Chamada de voz" onClick={() => onCall(profile.id, false)}>
                  <Phone size={15} />
                </RowAction>
                <RowAction label="Chamada de vídeo" onClick={() => onCall(profile.id, true)}>
                  <Video size={15} />
                </RowAction>
              </>
            }
          />
        ))}
      </PeopleList>
    </section>
  );
}

/** Botão redondo da linha: discreto em repouso, acende quando a linha recebe o mouse. */
function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-muted-foreground transition-[background-color,color,transform] duration-200 ease-clyro hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-95 group-hover/row:bg-secondary"
    >
      {children}
    </button>
  );
}

/**
 * Uma linha por pessoa. O bloco do nome é um botão que abre o perfil; as ações
 * ficam ao lado, fora dele, para não aninhar botões.
 */
function PersonRow({
  profile,
  index,
  caption,
  actions,
  onSelectProfile,
}: {
  profile: Profile | undefined;
  index: number;
  caption: string;
  actions: React.ReactNode;
  onSelectProfile: (id: string) => void;
}) {
  const name = profile?.display_name || profile?.username || "Usuário";
  return (
    <li
      className="clyro-enter group/row"
      style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}
    >
      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-accent/40">
        <button
          type="button"
          onClick={() => profile && onSelectProfile(profile.id)}
          title="Ver perfil"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <UserAvatar profile={profile} size={40} />
          <span className="min-w-0">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[15px] font-medium">{name}</span>
              {profile && (
                <span className="truncate text-xs text-muted-foreground opacity-0 transition-opacity duration-200 group-hover/row:opacity-100">
                  @{profile.username}
                </span>
              )}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <StatusDot status={profile?.status} className="h-2 w-2 shrink-0" />
              <span className="truncate">{caption}</span>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </div>
    </li>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: (() => void) | undefined;
}) {
  return (
    <div className="clyro-fade-in flex flex-col items-center justify-center px-6 py-24 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-border bg-panel shadow-panel">
        <ClyroMark className="h-9 w-9" glyphClassName="text-panel" />
      </span>
      <h2 className="mt-6 text-lg font-normal tracking-[-0.015em]">{title}</h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action && (
        <Button size="sm" className="mt-5" onClick={action}>
          <UserPlus size={14} /> Adicionar amigo
        </Button>
      )}
    </div>
  );
}
