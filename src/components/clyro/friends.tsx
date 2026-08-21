import { useMemo, useState } from "react";
import { Check, MessageSquare, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import { STATUS_LABEL, type Friendship, type Profile } from "@/lib/clyro-types";
import { UserAvatar } from "./primitives";

export function FriendsPanel({ onOpenDM }: { onOpenDM: (friendId: string) => void }) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const [username, setUsername] = useState("");

  const accepted = useMemo(
    () => friendships.filter((f) => f.status === "accepted"),
    [friendships],
  );
  const incoming = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.addressee_id === user?.id),
    [friendships, user?.id],
  );
  const outgoing = useMemo(
    () => friendships.filter((f) => f.status === "pending" && f.requester_id === user?.id),
    [friendships, user?.id],
  );

  const otherId = (f: Friendship) => (f.requester_id === user?.id ? f.addressee_id : f.requester_id);
  const friendProfiles = accepted
    .map((f) => profiles?.get(otherId(f)))
    .filter((p): p is Profile => !!p);
  const onlineFriends = friendProfiles.filter((p) => p.status !== "invisible");

  const addFriend = async () => {
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!handle || !user) return;
    const { data: matches } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .or(
        `username.eq.${handle},username.ilike.${handle}%,display_name.ilike.${handle}`,
      )
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
    <div className="flex-1 overflow-y-auto clyro-scroll px-6 py-5">
      <Tabs defaultValue="online">
        <TabsList>
          <TabsTrigger value="online">Online</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">
            Pendentes{incoming.length ? ` (${incoming.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="add">Adicionar</TabsTrigger>
        </TabsList>

        <TabsContent value="online" className="pt-5">
          <List
            title={`Online — ${onlineFriends.length}`}
            profiles={onlineFriends}
            onOpenDM={onOpenDM}
            empty="Ninguém online agora."
          />
        </TabsContent>

        <TabsContent value="all" className="pt-5">
          <List
            title={`Todos os amigos — ${friendProfiles.length}`}
            profiles={friendProfiles}
            onOpenDM={onOpenDM}
            empty="Você ainda não tem amigos aqui."
          />
        </TabsContent>

        <TabsContent value="pending" className="space-y-6 pt-5">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recebidos — {incoming.length}
            </h2>
            {incoming.length === 0 && <p className="text-sm text-muted-foreground">Nada por aqui.</p>}
            {incoming.map((f) => {
              const p = profiles?.get(f.requester_id);
              return (
                <Row key={f.id} profile={p} subtitle="Quer ser seu amigo">
                  <Button size="icon" variant="ghost" aria-label="Aceitar" onClick={() => void respond(f.id, "accepted")}>
                    <Check size={16} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Recusar" onClick={() => void respond(f.id, "reject")}>
                    <X size={16} />
                  </Button>
                </Row>
              );
            })}
          </section>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Enviados — {outgoing.length}
            </h2>
            {outgoing.map((f) => (
              <Row key={f.id} profile={profiles?.get(f.addressee_id)} subtitle="Aguardando resposta">
                <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => void respond(f.id, "reject")}>
                  <X size={16} />
                </Button>
              </Row>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="add" className="pt-5">
          <h2 className="text-sm font-semibold">Adicionar amigo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use o nome de usuário do Clyro, sem espaços.
          </p>
          <div className="mt-3 flex max-w-md gap-2">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@nomedeusuario"
              onKeyDown={(e) => e.key === "Enter" && void addFriend()}
            />
            <Button onClick={() => void addFriend()}>
              <UserPlus size={16} /> Enviar
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function List({
  title,
  profiles,
  onOpenDM,
  empty,
}: {
  title: string;
  profiles: Profile[];
  onOpenDM: (id: string) => void;
  empty: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {profiles.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      {profiles.map((profile) => (
        <Row
          key={profile.id}
          profile={profile}
          subtitle={profile.activity || STATUS_LABEL[profile.status]}
        >
          <Button size="icon" variant="ghost" aria-label="Mensagem" onClick={() => onOpenDM(profile.id)}>
            <MessageSquare size={16} />
          </Button>
        </Row>
      ))}
    </section>
  );
}

function Row({
  profile,
  subtitle,
  children,
}: {
  profile: Profile | undefined;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <UserAvatar profile={profile} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{profile?.display_name || profile?.username}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
