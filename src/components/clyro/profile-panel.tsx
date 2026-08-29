import { MessageSquare, Phone, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMutualServers, useProfiles } from "@/lib/clyro-queries";
import { initialsOf, STATUS_LABEL, type Profile } from "@/lib/clyro-types";
import { MediaImage, StatusDot, UserAvatar } from "./primitives";

const memberSince = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function ProfilePanel({
  profileId,
  onClose,
  onOpenDM,
  onCall,
}: {
  profileId: string;
  onClose: () => void;
  onOpenDM: (userId: string) => void;
  onCall: (userId: string, video: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const profile = profiles?.get(profileId);
  const { data: mutualServers = [] } = useMutualServers(profileId);
  const isSelf = profileId === user?.id;

  if (!profile) {
    return (
      <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-panel lg:flex">
        <PanelHeader onClose={onClose} />
        <p className="p-4 text-sm text-muted-foreground">Perfil indisponível.</p>
      </aside>
    );
  }

  return (
    <aside className="clyro-fade-in hidden w-[300px] shrink-0 flex-col border-l border-border bg-panel lg:flex">
      <PanelHeader onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto clyro-scroll">
        <Banner profile={profile} />

        <div className="px-4 pb-6">
          <div className="-mt-9 mb-3">
            <span className="inline-block rounded-full ring-4 ring-panel">
              <UserAvatar profile={profile} size={72} showStatus={false} />
            </span>
          </div>

          <h2 className="truncate text-xl font-bold leading-tight">
            {profile.display_name || profile.username}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            @{profile.username}
            {profile.pronouns ? ` · ${profile.pronouns}` : ""}
          </p>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot status={profile.status} className="h-2.5 w-2.5" />
            {STATUS_LABEL[profile.status]}
          </p>

          {profile.bio && (
            <div className="mt-4 rounded-lg bg-rail p-3">
              <Field label="Sobre mim" />
              <p className="mt-1 whitespace-pre-line text-sm">{profile.bio}</p>
            </div>
          )}

          {profile.activity && (
            <div className="mt-4 rounded-lg bg-rail p-3">
              <Field label="Atividade" />
              <p className="mt-1 text-sm">{profile.activity}</p>
            </div>
          )}

          <div className="mt-4 rounded-lg bg-rail p-3">
            <Field label="Membro desde" />
            <p className="mt-1 text-sm">{memberSince.format(new Date(profile.created_at))}</p>
          </div>

          <div className="mt-4 rounded-lg bg-rail p-3">
            <Field label={`Servidores em comum — ${mutualServers.length}`} />
            {mutualServers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {isSelf ? "Você ainda não entrou em nenhum servidor." : "Nenhum servidor em comum."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {mutualServers.map((server) => (
                  <li
                    key={server.id}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors duration-100 hover:bg-[var(--color-muted)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[10px] font-semibold">
                      {server.icon_url ? (
                        <MediaImage src={server.icon_url} className="h-full w-full object-cover" />
                      ) : (
                        initialsOf(server.name)
                      )}
                    </span>
                    <span className="min-w-0 truncate text-sm">{server.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isSelf && (
            <div className="mt-5 flex items-center gap-2">
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
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
      <h2 className="text-sm font-semibold">Perfil</h2>
      <button
        type="button"
        aria-label="Fechar perfil"
        onClick={onClose}
        className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
      >
        <X size={16} />
      </button>
    </header>
  );
}

/**
 * Usa a cor escolhida pela pessoa quando existe. Sem ela, o banner é derivado do
 * nome: sempre o mesmo ângulo de gradiente para o mesmo usuário.
 */
function Banner({ profile }: { profile: Profile }) {
  if (profile.banner_url) {
    return (
      <div className="h-20 w-full overflow-hidden bg-secondary">
        <MediaImage src={profile.banner_url} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (profile.banner_color) {
    return <div className="h-20 w-full" style={{ backgroundColor: profile.banner_color }} />;
  }
  const angle = [...profile.username].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <div
      className="h-20 w-full"
      style={{
        backgroundImage: `linear-gradient(${angle}deg, var(--color-rail), var(--color-accent))`,
      }}
    />
  );
}

function Field({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  );
}
