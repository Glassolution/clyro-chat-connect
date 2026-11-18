import { ArrowLeft2, Call, More, ProfileCircle, Video } from "iconsax-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABEL, type Conversation, type Profile } from "@/lib/clyro-types";
import { AvatarStack } from "@/components/workspace/team-panel";
import { UserAvatar } from "./primitives";
import { GroupAvatar } from "./conversation-list";
import { conversationTitle } from "./home-sidebar";

const ICON_BUTTON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-[background-color,color,transform] duration-200 ease-clyro hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand active:scale-95 data-[state=open]:bg-secondary data-[state=open]:text-foreground";

/**
 * Cabeçalho da conversa: quem é, se está online ou digitando (em verde, como
 * na referência), quem mais está no grupo e as chamadas.
 */
export function DirectChatHeader({
  conversation,
  profiles,
  selfId,
  typing,
  inCall,
  onBack,
  onCall,
  onOpenProfile,
}: {
  conversation: Conversation;
  profiles: Map<string, Profile> | undefined;
  selfId: string | undefined;
  typing: string[];
  inCall: boolean;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onOpenProfile: (id: string) => void;
}) {
  const others = conversation.member_ids.filter((id) => id !== selfId);
  const person = !conversation.is_group && others[0] ? profiles?.get(others[0]) : undefined;
  const title = conversationTitle(conversation, profiles, selfId);

  const status = (() => {
    if (typing.length > 0) {
      const who = conversation.is_group ? `${typing.slice(0, 2).join(", ")} ` : "";
      return { text: `${who}digitando…`, live: true };
    }
    if (inCall) return { text: "Em chamada", live: true };
    if (conversation.is_group)
      return { text: `${conversation.member_ids.length} pessoas`, live: false };
    const s = person?.status;
    return { text: !s || s === "invisible" ? "Offline" : STATUS_LABEL[s], live: false };
  })();

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar para as conversas"
        className={cn(ICON_BUTTON, "-ml-1 md:hidden")}
      >
        <ArrowLeft2 size={18} color="currentColor" />
      </button>

      <button
        type="button"
        onClick={() => person && onOpenProfile(person.id)}
        disabled={!person}
        className="flex min-w-0 items-center gap-3 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default"
      >
        {conversation.is_group ? (
          <GroupAvatar ids={others} profiles={profiles} />
        ) : (
          <UserAvatar profile={person} size={40} />
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">
            {title}
          </span>
          <span
            aria-live="polite"
            className={cn(
              "block truncate text-[12.5px]",
              status.live ? "font-medium text-success-ink" : "text-muted-foreground",
            )}
          >
            {status.text}
          </span>
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {conversation.is_group && (
          <span className="mr-2 hidden sm:block">
            <AvatarStack ids={others} profiles={profiles} max={4} size={26} />
          </span>
        )}
        <button
          type="button"
          aria-label="Chamada de voz"
          onClick={() => onCall(false)}
          className={ICON_BUTTON}
        >
          <Call size={18} color="currentColor" />
        </button>
        <button
          type="button"
          aria-label="Chamada de vídeo"
          onClick={() => onCall(true)}
          className={ICON_BUTTON}
        >
          <Video size={18} color="currentColor" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais opções" className={ICON_BUTTON}>
              <More size={18} color="currentColor" className="rotate-90" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="w-52 rounded-[16px] p-1.5">
            {person && (
              <DropdownMenuItem
                onSelect={() => onOpenProfile(person.id)}
                className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]"
              >
                <ProfileCircle size={16} color="currentColor" /> Ver perfil
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => onCall(false)}
              className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]"
            >
              <Call size={16} color="currentColor" /> Ligar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onCall(true)}
              className="h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]"
            >
              <Video size={16} color="currentColor" /> Chamada de vídeo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
