import { Headphones, MonitorUp, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles, useVoiceStates } from "@/lib/clyro-queries";
import type { Profile } from "@/lib/clyro-types";
import { UserAvatar } from "./primitives";

export function ActivityPanel({ onSelectProfile }: { onSelectProfile: (id: string) => void }) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const { data: voiceStates = [] } = useVoiceStates();

  const friendIds = friendships
    .filter((f) => f.status === "accepted")
    .map((f) => (f.requester_id === user?.id ? f.addressee_id : f.requester_id));

  const active = friendIds
    .map((id) => profiles?.get(id))
    .filter((p): p is Profile => !!p)
    .map((profile) => ({
      profile,
      voice: voiceStates.find((v) => v.user_id === profile.id),
    }))
    .filter((entry) => entry.voice || entry.profile.activity);

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-panel lg:flex">
      {/* Mesma altura dos outros cabeçalhos para as três colunas alinharem. */}
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h2 className="text-sm font-semibold">Ativo agora</h2>
      </header>
      {active.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Sparkles size={16} className="mb-2" />
          Está quieto por aqui. Quando seus amigos entrarem em uma call ou começarem algo novo,
          aparece nesta lista.
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto clyro-scroll p-4">
          {active.map(({ profile, voice }) => (
            <li key={profile.id} className="clyro-fade-in">
              <button
                type="button"
                onClick={() => onSelectProfile(profile.id)}
                title="Ver perfil"
                className="w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25"
              >
                <div className="flex items-center gap-2.5">
                  <UserAvatar profile={profile} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {profile.display_name || profile.username}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {voice ? <Headphones size={12} /> : null}
                      {voice?.sharing_screen ? <MonitorUp size={12} /> : null}
                      {profile.activity || (voice ? "Em uma call" : "")}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
