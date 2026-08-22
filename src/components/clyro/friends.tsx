import { useMemo, useState } from "react";
import { Check, MessageSquare, Phone, Search, UserPlus, Users, Video, X } from "lucide-react";
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
                <CardGrid>
                  {incoming.map((f, index) => (
                    <PersonCard
                      key={f.id}
                      profile={profiles?.get(f.requester_id)}
                      index={index}
                      caption="Quer ser seu amigo"
                      onSelectProfile={onSelectProfile}
                      actions={
                        <>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => void respond(f.id, "accepted")}
                          >
                            <Check size={14} /> Aceitar
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            aria-label="Recusar"
                            onClick={() => void respond(f.id, "reject")}
                          >
                            <X size={16} />
                          </Button>
                        </>
                      }
                    />
                  ))}
                </CardGrid>
              )}
            </section>

            <section>
              <SectionTitle>Enviados — {outgoing.length}</SectionTitle>
              {outgoing.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido aguardando.</p>
              ) : (
                <CardGrid>
                  {outgoing.map((f, index) => (
                    <PersonCard
                      key={f.id}
                      profile={profiles?.get(f.addressee_id)}
                      index={index}
                      caption="Aguardando resposta"
                      onSelectProfile={onSelectProfile}
                      actions={
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          onClick={() => void respond(f.id, "reject")}
                        >
                          <X size={14} /> Cancelar pedido
                        </Button>
                      }
                    />
                  ))}
                </CardGrid>
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
    <div className="relative mb-5">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar"
        aria-label="Buscar amigos"
        className="h-9 w-full rounded-lg bg-panel pl-9 pr-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
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
      <CardGrid>
        {profiles.map((profile, index) => (
          <PersonCard
            key={profile.id}
            profile={profile}
            index={index}
            caption={profile.activity || STATUS_LABEL[profile.status]}
            onSelectProfile={onSelectProfile}
            actions={
              <>
                <Button size="sm" className="flex-1" onClick={() => onOpenDM(profile.id)}>
                  <MessageSquare size={14} /> Mensagem
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Chamada de voz"
                  onClick={() => onCall(profile.id, false)}
                >
                  <Phone size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Chamada de vídeo"
                  onClick={() => onCall(profile.id, true)}
                >
                  <Video size={16} />
                </Button>
              </>
            }
          />
        ))}
      </CardGrid>
    </section>
  );
}

/**
 * O corpo do card é um botão que abre o perfil no painel da direita; as ações
 * ficam fora dele para não aninhar botões.
 */
function PersonCard({
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
    <article
      className="clyro-enter flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/25"
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
    >
      <button
        type="button"
        onClick={() => profile && onSelectProfile(profile.id)}
        className="flex flex-col items-center text-center"
        title="Ver perfil"
      >
        <UserAvatar profile={profile} size={64} showStatus={false} />
        <h3 className="mt-3 max-w-full truncate text-sm font-semibold">{name}</h3>
        {profile && (
          <p className="max-w-full truncate text-xs text-muted-foreground">@{profile.username}</p>
        )}
        <p className="mt-2 flex max-w-full items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot status={profile?.status} className="h-2 w-2 shrink-0" />
          <span className="truncate">{caption}</span>
        </p>
      </button>
      <div className="mt-4 flex items-center gap-2">{actions}</div>
    </article>
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
    <div className="clyro-fade-in flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-panel">
        <ClyroMark className="h-8 w-8" glyphClassName="text-panel" />
      </span>
      <h2 className="mt-5 text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{body}</p>
      {action && (
        <Button size="sm" className="mt-5" onClick={action}>
          <UserPlus size={14} /> Adicionar amigo
        </Button>
      )}
    </div>
  );
}
