import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Compass, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDiscoverServers, type DiscoverServer } from "@/lib/clyro-queries";
import { initialsOf } from "@/lib/clyro-types";

export function DiscoverPanel({ onOpenServer }: { onOpenServer: (serverId: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: servers = [], isLoading, error } = useDiscoverServers(search);
  const [joining, setJoining] = useState<string | null>(null);

  const join = async (server: DiscoverServer) => {
    if (!user) return;
    setJoining(server.id);
    const { error: joinError } = await supabase
      .from("server_members")
      .insert({ server_id: server.id, user_id: user.id });
    setJoining(null);
    if (joinError) {
      toast.error("Não foi possível entrar no servidor.");
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["servers", user.id] }),
      qc.invalidateQueries({ queryKey: ["discover-servers"] }),
    ]);
    toast.success(`Você entrou em ${server.name}.`);
    onOpenServer(server.id);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Compass size={16} />
        <span className="text-sm font-semibold">Descobrir servidores</span>
        <span className="ml-auto text-xs text-muted-foreground">Mais populares primeiro</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto clyro-scroll px-4 pb-8 pt-4">
        <div className="relative mb-6">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar servidor"
            aria-label="Buscar servidor"
            className="h-10 w-full rounded-xl bg-panel pl-9 pr-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
        </div>

        {error ? (
          <Notice
            title="A descoberta ainda não está ativa no banco"
            body="Falta aplicar a migração discover_servers no Supabase. Depois disso, esta lista carrega sozinha."
            detail={error instanceof Error ? error.message : undefined}
          />
        ) : isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[104px] animate-pulse rounded-xl border border-border bg-panel"
              />
            ))}
          </div>
        ) : servers.length === 0 ? (
          <Notice
            title={
              search.trim() ? "Nenhum servidor com esse nome" : "Nenhum servidor público ainda"
            }
            body={
              search.trim()
                ? "Tente outro termo ou entre por um código de convite."
                : "Assim que alguém criar um servidor público, ele aparece aqui."
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {servers.map((server, index) => (
              <ServerCard
                key={server.id}
                server={server}
                index={index}
                busy={joining === server.id}
                onJoin={() => void join(server)}
                onOpen={() => onOpenServer(server.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServerCard({
  server,
  index,
  busy,
  onJoin,
  onOpen,
}: {
  server: DiscoverServer;
  index: number;
  busy: boolean;
  onJoin: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className="clyro-enter flex gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25"
      style={{ animationDelay: `${Math.min(index, 11) * 35}ms` }}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-sm font-semibold">
        {server.icon_url ? (
          <img src={server.icon_url} alt="" className="h-full w-full object-cover" />
        ) : (
          initialsOf(server.name)
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-sm font-medium">{server.name}</h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users size={12} />
          {server.member_count} {server.member_count === 1 ? "membro" : "membros"}
        </p>
        {server.description && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{server.description}</p>
        )}
        <div className="mt-3">
          {server.is_member ? (
            <Button size="sm" variant="secondary" onClick={onOpen}>
              Abrir
            </Button>
          ) : (
            <Button size="sm" onClick={onJoin} disabled={busy}>
              {busy ? "Entrando…" : "Entrar"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Notice({
  title,
  body,
  detail,
}: {
  title: string;
  body: string;
  detail?: string | undefined;
}) {
  return (
    <div className="clyro-fade-in rounded-xl border border-dashed border-border p-6 text-center">
      <Compass size={18} className="mx-auto text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {detail && <p className="mt-3 font-mono text-xs text-muted-foreground/70">{detail}</p>}
    </div>
  );
}
