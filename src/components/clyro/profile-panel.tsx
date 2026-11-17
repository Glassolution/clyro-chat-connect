import { useState } from "react";
import { Link21 } from "iconsax-react";
import { Check, Copy, MoreHorizontal, Phone, Video, X } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useMutualServers, useProfiles } from "@/lib/clyro-queries";
import { initialsOf, STATUS_LABEL } from "@/lib/clyro-types";
import { cn } from "@/lib/utils";
import { MediaImage, StatusDot, UserAvatar } from "./primitives";

const sinceFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });

/**
 * Perfil em cartão: painel cinza, foto em quadrado de canto largo, nome e @,
 * as duas ações, dois números com divisória, o @ para copiar e um cartão
 * branco com o "sobre" e os workspaces em comum.
 *
 * `variant="page"` é o mesmo cartão como coluna da página de perfil: ocupa a
 * largura da coluna, aparece também no celular e troca o X por um menu "…".
 */
export function ProfilePanel({
  profileId,
  onClose,
  onOpenDM,
  onCall,
  onEditProfile,
  onOpenMessages,
  variant = "aside",
}: {
  profileId: string;
  onClose: () => void;
  onOpenDM: (userId: string) => void;
  onCall: (userId: string, video: boolean) => void;
  onEditProfile: () => void;
  onOpenMessages: () => void;
  variant?: "aside" | "page";
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const profile = profiles?.get(profileId);
  const { data: mutualServers = [] } = useMutualServers(profileId);
  const isSelf = profileId === user?.id;
  const [copied, setCopied] = useState(false);
  const [showMutual, setShowMutual] = useState(false);
  const page = variant === "page";
  const wrapper = page ? "flex w-full" : "hidden w-[340px] shrink-0 lg:flex";

  if (!profile) {
    return (
      <aside className={wrapper}>
        <div className="ws-frame flex flex-1 flex-col px-5 pt-4">
          <TopRow label="Perfil" onClose={onClose} />
          <p className="mt-6 text-center text-[14px] text-muted-foreground">Perfil indisponível.</p>
        </div>
      </aside>
    );
  }

  const name = profile.display_name || profile.username;
  const firstName = name.split(" ")[0];
  const since = sinceFormat.format(new Date(profile.created_at)).replace(" de ", " ");

  const copyHandle = async () => {
    await navigator.clipboard.writeText(`@${profile.username}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const about =
    profile.bio ||
    profile.activity ||
    (isSelf
      ? "Conte um pouco sobre você: o que faz, no que está trabalhando e o que procura."
      : `${firstName} ainda não escreveu nada sobre si.`);

  return (
    <aside className={cn("clyro-fade-in", wrapper)}>
      <div
        className={cn(
          "ws-frame flex min-h-0 flex-1 flex-col items-center px-5 pb-5 pt-4",
          page ? "sm:px-7 sm:pb-7 sm:pt-6" : "overflow-y-auto clyro-scroll",
        )}
      >
        {page ? (
          <PageTopRow
            label={isSelf ? `Olá, ${firstName}!` : `Perfil de ${firstName}`}
            onClose={onClose}
            onCopy={() => void copyHandle()}
            onEdit={isSelf ? onEditProfile : undefined}
          />
        ) : (
          <TopRow label={isSelf ? `Olá, ${firstName}!` : "Perfil"} onClose={onClose} />
        )}

        <div className={cn("overflow-hidden rounded-[28px]", page ? "mt-3" : "mt-1")}>
          <UserAvatar
            profile={profile}
            size={page ? 128 : 112}
            showStatus={false}
            className="[&>span]:rounded-[28px] [&>span]:text-[2.25rem]"
          />
        </div>

        <h2 className="mt-4 max-w-full truncate text-center text-[20px] font-bold leading-tight tracking-[-0.02em]">
          {name}
        </h2>
        <p className="mt-0.5 flex max-w-full items-center gap-1.5 truncate text-[13px] text-muted-foreground">
          @{profile.username}
          {profile.pronouns ? ` · ${profile.pronouns}` : ""}
          <span aria-hidden>·</span>
          <StatusDot status={profile.status} className="h-2 w-2 ring-0" />
          {STATUS_LABEL[profile.status]}
        </p>

        <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
          {isSelf ? (
            <>
              <button type="button" onClick={onEditProfile} className={primaryButton}>
                Editar perfil
              </button>
              <button type="button" onClick={onOpenMessages} className={secondaryButton}>
                Mensagens
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onOpenDM(profile.id)} className={primaryButton}>
                Mensagem
              </button>
              {/* Uma pílula, duas ações: voz no texto, vídeo no canto. */}
              <div className={cn(secondaryButton, "p-0")}>
                <button
                  type="button"
                  onClick={() => onCall(profile.id, false)}
                  className="flex h-full flex-1 items-center gap-2 pl-5 text-left"
                >
                  <Phone size={16} />
                  Ligar
                </button>
                <button
                  type="button"
                  aria-label="Chamada de vídeo"
                  title="Chamada de vídeo"
                  onClick={() => onCall(profile.id, true)}
                  className="mr-1.5 flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors hover:bg-secondary"
                >
                  <Video size={16} />
                </button>
              </div>
            </>
          )}
        </div>

        <dl className="mt-5 flex w-full items-center justify-center gap-7">
          <div className="text-center">
            <dd className="text-[16px] font-bold leading-tight tabular-nums">
              {mutualServers.length}
            </dd>
            <dt className="text-[13px] text-muted-foreground">
              {isSelf ? "Workspaces" : "Em comum"}
            </dt>
          </div>
          <span aria-hidden className="h-8 w-px bg-foreground/70" />
          <div className="text-center">
            <dd className="text-[16px] font-bold capitalize leading-tight">{since}</dd>
            <dt className="text-[13px] text-muted-foreground">No Clyro desde</dt>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => void copyHandle()}
          className="mt-5 flex h-11 w-full items-center gap-3 rounded-[14px] border border-black/[0.08] px-4 transition-colors hover:bg-card"
        >
          <Link21 size={18} color="currentColor" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-center text-[14px] font-medium underline decoration-foreground/40 underline-offset-4">
            @{profile.username}
          </span>
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </button>

        <section className="mt-4 w-full rounded-[22px] bg-card px-5 pb-4 pt-5 text-center">
          <h3 className="text-[15px] font-semibold">Sobre</h3>
          <p className="mt-2 whitespace-pre-line text-pretty text-[14px] leading-[1.55] text-foreground/75">
            {about}
          </p>

          {showMutual && (
            <ul className="mt-4 flex flex-col gap-1 text-left">
              {mutualServers.length === 0 ? (
                <li className="text-center text-[13px] text-muted-foreground">
                  {isSelf
                    ? "Você ainda não está em nenhum workspace."
                    : "Nenhum workspace em comum."}
                </li>
              ) : (
                mutualServers.map((server) => (
                  <li
                    key={server.id}
                    className="flex items-center gap-2.5 rounded-[12px] px-2 py-1.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-[10px] font-semibold">
                      {server.icon_url ? (
                        <MediaImage src={server.icon_url} className="h-full w-full object-cover" />
                      ) : (
                        initialsOf(server.name)
                      )}
                    </span>
                    <span className="min-w-0 truncate text-[14px]">{server.name}</span>
                  </li>
                ))
              )}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setShowMutual((v) => !v)}
            aria-expanded={showMutual}
            className="mt-4 h-10 w-full rounded-[12px] bg-card text-[14px] font-medium shadow-soft transition-colors hover:bg-secondary"
          >
            {showMutual
              ? "Ocultar workspaces"
              : isSelf
                ? "Ver meus workspaces"
                : "Ver workspaces em comum"}
          </button>
        </section>
      </div>
    </aside>
  );
}

const primaryButton =
  "flex h-11 items-center justify-center rounded-[14px] bg-primary text-[14px] font-medium text-primary-foreground transition-[background-color,transform] duration-200 ease-clyro hover:bg-primary/90 active:scale-[0.98]";
const secondaryButton =
  "flex h-11 items-center justify-center rounded-[14px] bg-card text-[14px] font-medium shadow-soft transition-transform duration-200 ease-clyro active:scale-[0.98]";

function PageTopRow({
  label,
  onClose,
  onCopy,
  onEdit,
}: {
  label: string;
  onClose: () => void;
  onCopy: () => void;
  onEdit: (() => void) | undefined;
}) {
  return (
    <div className="flex w-full items-center justify-between">
      <span className="truncate text-[15px] text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Opções do perfil"
            className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card data-[state=open]:bg-card"
          >
            <MoreHorizontal size={20} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onEdit && <DropdownMenuItem onClick={onEdit}>Editar perfil</DropdownMenuItem>}
          <DropdownMenuItem onClick={onCopy}>Copiar @</DropdownMenuItem>
          <DropdownMenuItem onClick={onClose}>Voltar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TopRow({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="flex w-full items-center justify-between">
      <span className="truncate text-[13px] text-muted-foreground">{label}</span>
      <button
        type="button"
        aria-label="Fechar perfil"
        onClick={onClose}
        className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <X size={16} />
      </button>
    </div>
  );
}
