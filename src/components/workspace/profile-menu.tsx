import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Add,
  ArrowDown2,
  Edit,
  Global,
  Key,
  Logout,
  ProfileCircle,
  Setting2,
  TickCircle,
} from "iconsax-react";
import { supabase } from "@/integrations/supabase/client";
import { inviteLink } from "@/lib/invite-link";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile, Server } from "@/lib/clyro-types";
import { UserAvatar } from "@/components/clyro/primitives";
import { WorkspaceIcon } from "./workspace-sidebar";

const MENU_ITEM = "h-9 gap-2.5 rounded-[10px] px-2.5 text-[13.5px]";

/**
 * A sua conta, no canto superior direito: a pílula com a sua foto abre o menu
 * para baixo com o perfil, a troca de workspace, as opções do workspace aberto
 * e as configurações.
 */
export function ProfileMenu({
  profile,
  speaking = false,
  profileActive = false,
  workspaces,
  workspace,
  userId,
  canManage,
  onProfile,
  onSettings,
  onSelectWorkspace,
  onCreateWorkspace,
  onViewProject,
  onEditProject,
  onLeft,
}: {
  profile: Profile | undefined;
  speaking?: boolean;
  profileActive?: boolean;
  workspaces: Server[];
  workspace: Server | null;
  userId: string;
  canManage: boolean;
  onProfile: () => void;
  onSettings: () => void;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onViewProject: () => void;
  onEditProject: () => void;
  onLeft: () => void;
}) {
  const qc = useQueryClient();
  const name = profile?.display_name || profile?.username || "Você";

  const copyCode = async () => {
    if (!workspace) return;
    try {
      await navigator.clipboard.writeText(inviteLink(workspace.invite_code));
      toast.success("Link de convite copiado. Quem abrir entra direto no workspace.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const leave = async () => {
    if (!workspace || !window.confirm(`Sair de ${workspace.name}?`)) return;
    const { error } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", workspace.id)
      .eq("user_id", userId);
    if (error) {
      toast.error("Não foi possível sair.");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["servers", userId] });
    onLeft();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Sua conta e workspaces"
          className={cn(
            "group flex h-11 max-w-[260px] items-center gap-2.5 rounded-full border border-black/[0.06] bg-white py-1 pl-1 pr-1.5 text-left outline-none transition-colors duration-200 ease-clyro hover:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-[#f5f5f5] sm:pr-3",
            profileActive && "border-brand/30 bg-brand-soft hover:bg-brand-soft",
          )}
        >
          <UserAvatar profile={profile} size={34} speaking={speaking} />
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-[13.5px] font-medium leading-tight tracking-[-0.01em]">
              {name}
            </span>
            {workspace && (
              <span className="block truncate text-[11.5px] leading-tight text-[#8a8a8a]">
                {workspace.name}
              </span>
            )}
          </span>
          <ArrowDown2
            size={14}
            color="currentColor"
            className="hidden shrink-0 text-[#a3a3a3] transition-transform duration-200 ease-clyro group-data-[state=open]:rotate-180 sm:block"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-64 rounded-[16px] p-1.5"
      >
        <div className="flex items-center gap-3 px-2.5 py-2">
          <UserAvatar profile={profile} size={36} showStatus={false} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{name}</p>
            {profile?.username && (
              <p className="truncate text-[12px] text-muted-foreground">@{profile.username}</p>
            )}
          </div>
        </div>
        <DropdownMenuItem onSelect={onProfile} className={MENU_ITEM}>
          <ProfileCircle size={16} color="currentColor" /> Ver meu perfil
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2.5 text-[12px] font-normal text-muted-foreground">
          Trocar de workspace
        </DropdownMenuLabel>
        {workspaces.map((ws) => {
          const on = ws.id === workspace?.id;
          return (
            <DropdownMenuItem
              key={ws.id}
              onSelect={() => onSelectWorkspace(ws.id)}
              className={cn(MENU_ITEM, on && "font-medium")}
            >
              <WorkspaceIcon workspace={ws} muted={!on} />
              <span className="min-w-0 flex-1 truncate">{ws.name}</span>
              {on && (
                <TickCircle size={16} color="var(--brand)" variant="Bold" className="shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuItem onSelect={onCreateWorkspace} className={MENU_ITEM}>
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#a8a8a8] text-white">
            <Add size={15} color="currentColor" />
          </span>
          Novo workspace
        </DropdownMenuItem>

        {workspace && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="truncate px-2.5 text-[12px] font-normal text-muted-foreground">
              {workspace.name}
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={onViewProject} className={MENU_ITEM}>
              <Global size={16} color="currentColor" /> Ver página do projeto
            </DropdownMenuItem>
            {canManage && (
              <DropdownMenuItem onSelect={onEditProject} className={MENU_ITEM}>
                <Edit size={16} color="currentColor" /> Editar projeto
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void copyCode()} className={MENU_ITEM}>
              <Key size={16} color="currentColor" /> Copiar link de convite
            </DropdownMenuItem>
            {workspace.owner_id !== userId && (
              <DropdownMenuItem
                onSelect={() => void leave()}
                className={cn(MENU_ITEM, "text-destructive focus:text-destructive")}
              >
                <Logout size={16} color="currentColor" /> Sair do workspace
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSettings} className={MENU_ITEM}>
          <Setting2 size={16} color="currentColor" /> Configurações
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
