import { Headphones, MonitorUp, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import { useVoiceStates } from "@/lib/voice-presence";
import type { Profile } from "@/lib/clyro-types";
import { UserAvatar } from "./primitives";

export function ActivityPanel({ onSelectProfile }: { onSelectProfile: (id: string) => void }) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const voiceStates = useVoiceStates();

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
        <div className="clyro-fade-in flex flex-1 flex-col items-center justify-center px-7 pb-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-panel">
            <Sparkles size={20} className="text-muted-foreground" />
          </span>
          <h3 className="mt-5 text-sm font-medium">Está quieto por aqui</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Quando seus amigos entrarem em uma call ou começarem algo novo, aparece nesta lista.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto clyro-scroll p-4">
          {active.map(({ profile, voice }) => (
            <li key={profile.id} className="clyro-fade-in">
              <button
                type="button"
                onClick={() => onSelectProfile(profile.id)}
                title="Ver perfil"
                className="clyro-lift w-full rounded-xl border border-border bg-card p-3 text-left hover:border-foreground/20 hover:bg-accent/35"
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
