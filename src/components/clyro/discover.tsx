import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Users, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useDiscoverServers, type DiscoverServer, type DiscoverSort } from "@/lib/clyro-queries";
import { initialsOf } from "@/lib/clyro-types";
import { MediaImage } from "./primitives";

const SORTS: { value: DiscoverSort; label: string }[] = [
  { value: "popular", label: "Em alta" },
  { value: "new", label: "Novas" },
];

/**
 * A vitrine: é aqui que alguém chega e vê as comunidades que outras pessoas
 * construíram em volta dos próprios produtos.
 */
export function DiscoverPanel({ onOpenServer }: { onOpenServer: (serverId: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<DiscoverSort>("popular");
  const { data: communities = [], isLoading, error } = useDiscoverServers(search, sort);
  const [joining, setJoining] = useState<string | null>(null);

  const join = async (community: DiscoverServer) => {
    if (!user) return;
    setJoining(community.id);
    const { error: joinError } = await supabase
      .from("server_members")
      .insert({ server_id: community.id, user_id: user.id });
    setJoining(null);
    if (joinError) {
      toast.error("Não foi possível entrar na comunidade.");
      return;
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["servers", user.id] }),
      qc.invalidateQueries({ queryKey: ["discover-servers"] }),
    ]);
    toast.success(`Você entrou em ${community.name}.`);
    onOpenServer(community.id);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <UsersRound size={16} />
        <span className="text-sm font-semibold">Comunidades</span>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
          Feitas por quem está construindo um produto
        </span>
      </header>

      <div className="clyro-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-6 sm:px-8">
          {/* abas de ordenação e busca, na mesma linha */}
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex shrink-0 items-center gap-1 rounded bg-rail p-1">
              {SORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSort(option.value)}
                  className={cn(
                    "rounded px-4 py-1.5 text-sm font-medium transition-colors duration-100",
                    sort === option.value
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative md:ml-auto md:w-80">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar comunidade"
                aria-label="Buscar comunidade"
                className="h-9 w-full rounded bg-rail pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {error ? (
            <Notice
              title="A descoberta ainda não está ativa no banco"
              body="Falta aplicar a migração discover_communities no Supabase. Depois disso, esta vitrine carrega sozinha."
              detail={error instanceof Error ? error.message : undefined}
            />
          ) : isLoading ? (
            <Gallery>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="clyro-fade-in">
                  <div className="aspect-[16/10] animate-pulse rounded-2xl bg-panel" />
                  <div className="mt-4 h-4 w-2/5 animate-pulse rounded bg-panel" />
                  <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-panel/70" />
                </div>
              ))}
            </Gallery>
          ) : communities.length === 0 ? (
            <Notice
              title={
                search.trim() ? "Nenhuma comunidade com esse nome" : "Nenhuma comunidade ainda"
              }
              body={
                search.trim()
                  ? "Tente outro termo, ou entre por um código de convite."
                  : "Assim que alguém publicar a comunidade do próprio produto, ela aparece aqui."
              }
            />
          ) : (
            <Gallery>
              {communities.map((community, index) => (
                <CommunityCard
                  key={community.id}
                  community={community}
                  index={index}
                  busy={joining === community.id}
                  onJoin={() => void join(community)}
                  onOpen={() => onOpenServer(community.id)}
                />
              ))}
            </Gallery>
          )}
        </div>
      </div>
    </section>
  );
}

function Gallery({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {children}
    </div>
  );
}

function CommunityCard({
  community,
  index,
  busy,
  onJoin,
  onOpen,
}: {
  community: DiscoverServer;
  index: number;
  busy: boolean;
  onJoin: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className="clyro-enter group/card"
      style={{ animationDelay: `${Math.min(index, 15) * 40}ms` }}
    >
      <button
        type="button"
        onClick={community.is_member ? onOpen : onJoin}
        title={community.is_member ? "Abrir comunidade" : "Entrar na comunidade"}
        className="block w-full overflow-hidden rounded-2xl border border-border bg-panel transition-[transform,border-color] duration-300 ease-clyro hover:-translate-y-1 hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Cover community={community} />
      </button>

      <div className="mt-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium">{community.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
            <Users size={13} className="shrink-0" />
            {community.member_count} {community.member_count === 1 ? "membro" : "membros"}
            {community.description ? (
              <>
                <span className="text-border">·</span>
                <span className="truncate">{community.description}</span>
              </>
            ) : null}
          </p>
        </div>

        {community.is_member ? (
          <Button size="sm" variant="secondary" className="shrink-0 rounded px-4" onClick={onOpen}>
            Abrir
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 rounded px-4"
            onClick={onJoin}
            disabled={busy}
          >
            {busy ? "Entrando…" : "Entrar"}
          </Button>
        )}
      </div>
    </article>
  );
}

/**
 * A capa. Com ícone, ele vira o fundo desfocado e aparece nítido no centro;
 * sem ícone, sobra a inicial sobre uma malha discreta — nunca um buraco vazio.
 */
function Cover({ community }: { community: DiscoverServer }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-stage">
      {community.icon_url ? (
        <>
          <MediaImage
            src={community.icon_url}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl"
          />
          <MediaImage
            src={community.icon_url}
            className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl object-cover shadow-panel transition-transform duration-500 ease-clyro group-hover/card:scale-105"
          />
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "radial-gradient(circle at center, var(--color-border) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <span className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-secondary text-xl font-medium text-secondary-foreground shadow-panel transition-transform duration-500 ease-clyro group-hover/card:scale-105">
            {initialsOf(community.name)}
          </span>
        </>
      )}
    </div>
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
    <div className="clyro-fade-in flex flex-col items-center px-6 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-3xl border border-border bg-panel shadow-panel">
        <UsersRound size={22} className="text-muted-foreground" />
      </span>
      <h3 className="mt-6 text-lg font-normal tracking-[-0.015em]">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {detail && (
        <p className="mt-4 max-w-lg font-mono text-xs leading-relaxed text-muted-foreground/60">
          {detail}
        </p>
      )}
    </div>
  );
}
