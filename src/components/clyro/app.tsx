import { useEffect, useMemo, useRef, useState } from "react";
import { readSavedWorkspace, saveWorkspace } from "@/lib/workspace-memory";
import { Hash, Volume2 } from "@/components/icons";
import { ArrowLeft2 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import {
  useChannels,
  useConversations,
  useProfiles,
  useRealtimeSync,
  useServers,
} from "@/lib/clyro-queries";
import { useVoiceRoom } from "@/lib/useVoiceRoom";
import { playJoinSound, playLeaveSound } from "@/lib/call-sounds";
import { useVoicePresence, VoicePresenceProvider } from "@/lib/voice-presence";
import type { Channel, Profile, Selection } from "@/lib/clyro-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  useIncomingInvites,
  useTeams,
  useWorkspaceInvites,
  useWorkspaceMembers,
  useWorkspaceRealtime,
} from "@/lib/workspace-queries";
import { HomeSidebar, conversationTitle, dedupeDirectConversations } from "./home-sidebar";
import { ChatPanel } from "./chat";
import { ConversationList } from "./conversation-list";
import { DirectChatHeader } from "./direct-chat-header";
import { FriendsPanel } from "./friends";
import { ActivityPanel } from "./activity";
import { ProfilePanel } from "./profile-panel";
import { ProfilePage } from "./profile-page";
import { VoiceStage, VoiceDock } from "./voice-stage";
import { VoiceAudio } from "./media";
import { UserBar } from "./user-bar";
import { SettingsDialog } from "./settings-dialog";
import { TopNav, type Section } from "@/components/workspace/top-nav";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { ProfileMenu } from "@/components/workspace/profile-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dashboard } from "@/components/workspace/dashboard";
import { RoomsBoard } from "@/components/workspace/rooms-board";
import {
  canEnterRoom,
  canManageRoom,
  emptyRooms,
  useRoomActions,
  useRooms,
  useEmptyRoomSweep,
  useRoomsRealtime,
} from "@/lib/room-queries";
import { TeamManager, CreateTeamDialog } from "@/components/workspace/team-panel";
import { InviteDialog } from "@/components/workspace/invite-dialog";
import { ProjectDialog } from "@/components/discover/project-dialog";
import { useProject, useProjectRequests } from "@/lib/project-queries";
import { useNavigate } from "@tanstack/react-router";
import { ComingSoon, IncomingInvites, WelcomeScreen } from "@/components/workspace/onboarding";
import { PageFrame } from "@/components/workspace/page-frame";
import { isDesktopApp } from "@/lib/desktop";

const SIDEBAR_KEY = "clyro.sidebar.collapsed";

type VoiceSession = {
  roomKey: string;
  label: string;
  channelId: string | null;
  /** Guardado na sessão porque a lista de canais só existe do servidor aberto. */
  serverId: string | null;
  conversationId: string | null;
};

export function ClyroApp() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;
  useRealtimeSync(userId);

  const { data: profiles } = useProfiles();
  const { data: servers = [] } = useServers(userId);
  const { data: conversations = [] } = useConversations(userId);

  useWorkspaceRealtime(userId);

  const [section, setSection] = useState<Section>("dashboard");
  const [selection, setSelection] = useState<Selection>({ kind: "friends" });
  const [voice, setVoice] = useState<VoiceSession | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  // Perfil aberto como página: toma o lugar da tela atual até trocar de seção.
  const [profilePageId, setProfilePageId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => readSavedWorkspace());
  const [createOpen, setCreateOpen] = useState(false);
  const [invite, setInvite] = useState<{ teamId: string | null } | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  // No desktop a sidebar pode virar um trilho de ícones; a escolha fica salva.
  // No aplicativo a sidebar fica sempre como trilho de ícones, como no Discord.
  const [desktop] = useState(() => isDesktopApp());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (isDesktopApp()) return true;
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleSidebar = () =>
    setSidebarCollapsed((was) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, was ? "0" : "1");
      } catch {
        /* sem armazenamento, vale só para esta visita */
      }
      return !was;
    });
  // No celular e no tablet a sidebar mora num menu que desliza da esquerda.
  const [menuOpen, setMenuOpen] = useState(false);
  /** No celular, Amigos ocupa a tela no lugar da lista de conversas. */
  const [friendsPane, setFriendsPane] = useState(false);
  const navigate = useNavigate();

  // O workspace aberto: o escolhido, se você ainda faz parte dele, ou o primeiro.
  const workspace = servers.find((s) => s.id === workspaceId) ?? servers[0] ?? null;
  useEffect(() => {
    if (workspace) saveWorkspace(workspace.id);
  }, [workspace]);

  const activeServerId = workspace?.id ?? null;
  const { data: channels = [] } = useChannels(activeServerId);
  const activeServer = workspace;
  const { data: members = [] } = useWorkspaceMembers(activeServerId);
  const { data: teams = [] } = useTeams(activeServerId);
  const { data: invites = [] } = useWorkspaceInvites(activeServerId);
  const { data: incoming = [] } = useIncomingInvites(userId, user?.email);
  const myRole = members.find((m) => m.user_id === userId)?.role;
  const canManage = !!workspace && (workspace.owner_id === userId || myRole === "admin");
  /** Salas abre na grade de cartões; abrir uma sala troca para a call e o chat dela. */
  const [roomsGrid, setRoomsGrid] = useState(true);
  const { data: roomsData } = useRooms(activeServerId);
  const rooms = roomsData ?? emptyRooms();
  const roomActions = useRoomActions(activeServerId ?? "", userId);
  const { data: project } = useProject(canManage ? activeServerId : null);
  // Pedidos de entrada: só quem é dono do workspace vê e responde.
  const isWorkspaceOwner = !!workspace && workspace.owner_id === userId;
  const { data: requests = [] } = useProjectRequests(activeServerId, isWorkspaceOwner);
  const rtc = useVoiceRoom(voice?.roomKey ?? null, userId ?? null);

  /**
   * A sua presença publicada na sala. Sai do estado da chamada e é o que os
   * outros veem — inclusive o "saiu", que agora é o próprio servidor de
   * presença quem anuncia quando a conexão cai.
   */
  const presence = useMemo(
    () =>
      voice && userId
        ? {
            userId,
            channelId: voice.channelId,
            conversationId: voice.conversationId,
            muted: rtc.muted,
            deafened: rtc.deafened,
            sharingScreen: rtc.sharingScreen,
            cameraOn: rtc.cameraOn,
          }
        : null,
    [voice, userId, rtc.muted, rtc.deafened, rtc.sharingScreen, rtc.cameraOn],
  );

  const voiceStates = useVoicePresence(userId, presence);

  // Entrou na mesma call por outra aba ou aparelho: esta sai, para a pessoa
  // não aparecer duas vezes para o time.
  useEffect(() => {
    if (!rtc.superseded) return;
    setVoice(null);
    toast.info("Você entrou nessa call em outra aba. Esta saiu da chamada.");
  }, [rtc.superseded]);

  /** Sala vazia por 2 minutos some da aba (e é apagada por quem pode). */
  const expiredRooms = useEmptyRoomSweep({
    serverId: activeServerId,
    channels,
    rooms,
    states: voiceStates,
    userId,
    isOwner: !!workspace && workspace.owner_id === userId,
  });

  // Aviso sonoro de entrada e saída da própria chamada.
  const wasInVoiceRef = useRef(false);
  useEffect(() => {
    const inVoice = !!voice;
    if (inVoice === wasInVoiceRef.current) return;
    wasInVoiceRef.current = inVoice;
    if (inVoice) playJoinSound();
    else playLeaveSound();
  }, [voice]);

  useEffect(() => {
    if (!userId) return;
    const run = async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ activity: voice ? `Em call · ${voice.label}` : null })
        .eq("id", userId);
      if (error) console.error("[clyro] falha ao atualizar a atividade", error);
    };
    void run();
  }, [userId, voice]);

  /** Abre as salas de um workspace, já no primeiro canal de texto. */
  const openServer = async (serverId: string) => {
    setWorkspaceId(serverId);
    setSection("rooms");
    const { data } = await supabase
      .from("channels")
      .select("id, kind, position")
      .eq("server_id", serverId)
      .eq("kind", "text")
      .order("position")
      .limit(1);
    const first = data?.[0];
    if (first) setSelection({ kind: "channel", serverId, channelId: first.id });
  };

  const selectWorkspace = (id: string) => {
    setWorkspaceId(id);
    setProfileId(null);
    setProfilePageId(null);
    if (section === "rooms") void openServer(id);
    else if (section === "messages") setSection("dashboard");
  };

  const changeSection = (next: Section) => {
    setProfileId(null);
    setProfilePageId(null);
    if (next === "rooms" && workspace) {
      setRoomsGrid(true);
      const inWorkspace =
        (selection.kind === "channel" || selection.kind === "voice") &&
        selection.serverId === workspace.id;
      if (!inWorkspace) {
        void openServer(workspace.id);
        return;
      }
    }
    if (next === "rooms") setRoomsGrid(true);
    if (next === "messages" && selection.kind !== "dm") setSelection({ kind: "friends" });
    setSection(next);
  };

  /** Abre (criando se preciso) a conversa 1:1 com alguém e devolve o id dela. */
  const openDM = async (friendId: string): Promise<string | null> => {
    if (!userId) return null;
    // Mesma regra da lista lateral, para abrir sempre a mesma conversa com a pessoa.
    const existing = dedupeDirectConversations(conversations, userId).find(
      (c) => !c.is_group && c.member_ids.includes(friendId),
    );
    if (existing) {
      setSelection({ kind: "dm", conversationId: existing.id });
      setSection("messages");
      return existing.id;
    }
    const { data, error } = await supabase
      .from("conversations")
      .insert({ is_group: false, created_by: userId })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível abrir a conversa.");
      return null;
    }
    await supabase.from("conversation_members").insert([
      { conversation_id: data.id, user_id: userId },
      { conversation_id: data.id, user_id: friendId },
    ]);
    await qc.invalidateQueries({ queryKey: ["conversations", userId] });
    setSelection({ kind: "dm", conversationId: data.id });
    setSection("messages");
    return data.id;
  };

  /** Liga para alguém a partir do card ou do perfil: abre a DM e entra na call. */
  const callUser = async (friendId: string, video: boolean) => {
    const conversationId = await openDM(friendId);
    if (!conversationId) return;
    const person = profiles?.get(friendId);
    setVoice({
      roomKey: `voice-dm-${conversationId}`,
      label: person?.display_name || person?.username || "Conversa",
      channelId: null,
      serverId: null,
      conversationId,
    });
    if (video) void rtc.toggleCamera();
  };

  /**
   * Clicar num canal de voz abre a tela da chamada e entra nele se ainda não
   * estiver conectado. Sair é só pelo botão de desligar — antes o mesmo clique
   * que abria o canal também derrubava a call de quem já estava dentro.
   */
  const openVoice = (channel: Channel, skipGate = false) => {
    // Sala com pedido: quem não foi liberado fica na grade e pode pedir dali.
    if (
      !skipGate &&
      channel.server_id === activeServerId &&
      voice?.channelId !== channel.id &&
      !canEnterRoom(rooms, channel.id, userId, canManage)
    ) {
      const mine = rooms.access.find((a) => a.channel_id === channel.id && a.user_id === userId);
      setSection("rooms");
      setRoomsGrid(true);
      if (mine?.status === "pending") {
        toast(`Seu pedido para ${channel.name} ainda está esperando.`);
        return;
      }
      toast(`${channel.name} pede para entrar.`, {
        description: "Quem cuida da sala recebe o pedido e libera.",
        action: {
          label: "Pedir",
          onClick: () =>
            void roomActions
              .requestEntry(channel.id)
              .then(() => toast.success("Pedido enviado."))
              .catch(() => toast.error("Não foi possível enviar o pedido.")),
        },
      });
      return;
    }
    setSelection({ kind: "voice", serverId: channel.server_id, channelId: channel.id });
    setSection("rooms");
    setRoomsGrid(false);
    if (voice?.channelId === channel.id) return;
    setVoice({
      roomKey: `voice-channel-${channel.id}`,
      label: channel.name,
      channelId: channel.id,
      serverId: channel.server_id,
      conversationId: null,
    });
  };

  /*
   * Pedidos de entrada em tempo real: quem cuida da sala é avisado na hora e
   * pode liberar do próprio aviso; quem pediu fica sabendo da resposta.
   */
  useRoomsRealtime(activeServerId, ({ type, row }) => {
    if (type === "DELETE" || !userId) return;
    const channel = channels.find((c) => c.id === row.channel_id);
    const room = channel?.name ?? "a sala";
    if (row.user_id === userId) {
      if (type !== "UPDATE") return;
      if (row.status === "approved") {
        toast.success(`Você já pode entrar em ${room}.`, {
          action: channel
            ? { label: "Entrar", onClick: () => openVoice(channel, true) }
            : undefined,
        });
      } else if (row.status === "denied") {
        toast(`Seu pedido para ${room} não foi aceito.`);
      }
      return;
    }
    if (row.status !== "pending" || !canManageRoom(rooms, row.channel_id, userId, canManage))
      return;
    const person = profiles?.get(row.user_id);
    toast(`${person?.display_name || person?.username || "Alguém"} pediu para entrar em ${room}.`, {
      action: {
        label: "Liberar",
        onClick: () =>
          void roomActions
            .decide(row.channel_id, row.user_id, true)
            .then(() => toast.success("Acesso liberado."))
            .catch(() => toast.error("Não foi possível liberar agora.")),
      },
    });
  });

  /*
   * Link de sala (/app?sala=<id>): descobre o workspace dela, abre a aba Salas
   * e tenta entrar — a mesma porta de sempre, então sala com pedido vira pedido.
   */
  const [linkedRoom, setLinkedRoom] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sala"),
  );
  useEffect(() => {
    if (!linkedRoom || !userId) return;
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    let cancelled = false;
    void supabase
      .from("channels")
      .select("id, server_id")
      .eq("id", linkedRoom)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data) {
          toast.error("Essa sala não existe mais, ou você não está no workspace dela.");
          setLinkedRoom(null);
          return;
        }
        setWorkspaceId(data.server_id);
        setSection("rooms");
        setRoomsGrid(true);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedRoom, userId]);
  useEffect(() => {
    if (!linkedRoom || !roomsData) return;
    const channel = channels.find((c) => c.id === linkedRoom);
    if (!channel) return;
    setLinkedRoom(null);
    openVoice(channel);
    // openVoice muda a cada render; o que importa é a sala e os dados chegarem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRoom, roomsData, channels]);

  const activeConversation = useMemo(
    () =>
      selection.kind === "dm"
        ? (conversations.find((c) => c.id === selection.conversationId) ?? null)
        : null,
    [conversations, selection],
  );

  const selfSpeaking = rtc.localSpeaking && !rtc.muted && !!voice;

  const activeChannel =
    selection.kind === "channel"
      ? (channels.find((c) => c.id === selection.channelId) ?? null)
      : null;

  const voiceChannel =
    selection.kind === "voice"
      ? (channels.find((c) => c.id === selection.channelId) ?? null)
      : null;

  const voiceChannelMembers = useMemo(
    () =>
      voiceChannel
        ? voiceStates
            .filter((v) => v.channel_id === voiceChannel.id)
            .map((v) => profiles?.get(v.user_id))
            .filter((p): p is Profile => !!p)
        : [],
    [profiles, voiceChannel, voiceStates],
  );

  useEffect(() => {
    // Trocar de tela fecha o painel de perfil. Nas conversas ele não abre
    // sozinho: o chat fica com a largura toda, e o perfil de quem está do
    // outro lado abre pelo cabeçalho (nome ou "Ver perfil").
    setProfileId(null);
  }, [selection]);

  // Abrir uma conversa, uma sala ou outra seção fecha a página de perfil.
  useEffect(() => {
    setProfilePageId(null);
  }, [section, selection]);

  const startCall = (video: boolean) => {
    if (!activeConversation) return;
    setVoice({
      roomKey: `voice-dm-${activeConversation.id}`,
      label: conversationTitle(activeConversation, profiles, userId),
      channelId: null,
      serverId: null,
      conversationId: activeConversation.id,
    });
    if (video) void rtc.toggleCamera();
  };

  const openVoiceView = () => {
    if (!voice) return;
    if (voice.channelId && voice.serverId) {
      setWorkspaceId(voice.serverId);
      setSelection({ kind: "voice", serverId: voice.serverId, channelId: voice.channelId });
      setSection("rooms");
      setRoomsGrid(false);
    } else if (voice.conversationId) {
      setSelection({ kind: "dm", conversationId: voice.conversationId });
      setSection("messages");
    }
  };

  const voiceDock = voice && (
    <VoiceDock
      title={voice.label}
      subtitle={voice.serverId ? servers.find((s) => s.id === voice.serverId)?.name : undefined}
      rtc={rtc}
      onOpen={openVoiceView}
      onLeave={() => setVoice(null)}
    />
  );

  const userBar = (
    <>
      {voiceDock}
      <UserBar
        muted={rtc.muted}
        deafened={rtc.deafened}
        inVoice={!!voice}
        speaking={selfSpeaking}
        onToggleMute={rtc.toggleMute}
        onToggleDeafen={rtc.toggleDeafen}
      />
    </>
  );

  const profiles_ = profiles;
  const memberIds = members.map((m) => m.user_id);
  const openInvite = (teamId?: string) => setInvite({ teamId: teamId ?? null });

  /** A mesma sidebar na coluna fixa (desktop) e no menu (celular e tablet). */
  const profileActive = !!userId && profilePageId === userId;
  // Dentro da call, a tela é só dela: o topo perde os links e a call sobe.
  const inCall = section === "rooms" && !roomsGrid && selection.kind === "voice" && !profilePageId;
  const badges = { dashboard: incoming.length + requests.length };

  /** A sua conta, no canto superior direito do topo. */
  const account = (
    <ProfileMenu
      profile={profile ?? undefined}
      speaking={selfSpeaking}
      profileActive={profileActive}
      workspaces={servers}
      workspace={workspace}
      userId={userId ?? ""}
      canManage={canManage}
      onProfile={() => {
        setMenuOpen(false);
        if (userId) setProfilePageId(userId);
      }}
      onSettings={() => {
        setMenuOpen(false);
        setSettingsOpen(true);
      }}
      onSelectWorkspace={(id) => {
        setMenuOpen(false);
        selectWorkspace(id);
      }}
      onCreateWorkspace={() => {
        setMenuOpen(false);
        setCreateOpen(true);
      }}
      onEditProject={() => {
        setMenuOpen(false);
        setEditProjectOpen(true);
      }}
      onLeft={() => setWorkspaceId(null)}
    />
  );

  /** A mesma sidebar na coluna fixa (desktop) e no menu (celular e tablet). */
  const sidebarProps = {
    section,
    onSection: (s: Section) => {
      changeSection(s);
      setMenuOpen(false);
    },
    badges,
    profileActive,
    workspace,
    members,
    teams,
    profiles: profiles_,
    userId: userId ?? "",
    conversationCount: userId ? dedupeDirectConversations(conversations, userId).length : 0,
    canManage,
    onInvite: () => {
      setMenuOpen(false);
      openInvite();
    },
  };
  const sidebar = <WorkspaceSidebar {...sidebarProps} />;

  // Telas que vivem dentro de um workspace: sem nenhum, a primeira coisa é criar.
  const needsWorkspace = section !== "messages" && !workspace;

  const profileAside =
    profileId && !profilePageId ? (
      <ProfilePanel
        profileId={profileId}
        onClose={() => setProfileId(null)}
        onOpenDM={(id) => void openDM(id)}
        onCall={(id, video) => void callUser(id, video)}
        onEditProfile={() => setSettingsOpen(true)}
        onOpenMessages={() => {
          setProfileId(null);
          changeSection("messages");
        }}
      />
    ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <VoicePresenceProvider value={voiceStates}>
        {/* Fundo cinza e uma moldura branca de canto largo; no celular a moldura
          ocupa a tela toda. */}
        <div className="flex h-dvh w-full overflow-hidden bg-app-bg text-foreground lg:p-3">
          {/* O áudio dos participantes fica fora de qualquer tela: a call continua
            tocando ao navegar entre painel, equipe e salas. */}
          {voice && <VoiceAudio peers={rtc.peers} deafened={rtc.deafened} />}

          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-card lg:rounded-[28px] lg:shadow-[0_0_0_1px_rgb(var(--line)/0.04),0_1px_3px_rgb(0_0_0/0.04)]">
            <TopNav
              section={section}
              badges={badges}
              onMenu={() => setMenuOpen(true)}
              onOpenWorkspace={() => changeSection("dashboard")}
              profileActive={profileActive}
              compact={inCall}
              account={account}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={desktop ? undefined : toggleSidebar}
              desktop={desktop}
            />

            <div className="flex min-h-0 flex-1">
              <aside
                aria-label="Seções do workspace"
                className={cn(
                  "hidden shrink-0 flex-col overflow-y-auto overflow-x-hidden px-3 pb-4 pt-1 transition-[width] duration-300 ease-clyro clyro-scroll motion-reduce:transition-none lg:flex xl:px-4",
                  sidebarCollapsed ? "w-[76px] xl:w-[84px]" : "w-[232px] xl:w-[248px]",
                  inCall && "lg:pt-[68px]",
                )}
              >
                <WorkspaceSidebar
                  {...sidebarProps}
                  collapsed={sidebarCollapsed}
                  onToggleCollapsed={toggleSidebar}
                  locked={desktop}
                  selfProfile={profile ?? undefined}
                  onOpenSelf={() => {
                    if (userId) setProfilePageId(userId);
                  }}
                  onSettings={() => setSettingsOpen(true)}
                />
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                {!profilePageId && (section === "dashboard" || needsWorkspace) && (
                  <IncomingInvites
                    invites={incoming}
                    userId={userId ?? ""}
                    onJoined={(id) => {
                      setWorkspaceId(id);
                      setSection("dashboard");
                    }}
                  />
                )}

                <div className="flex min-h-0 flex-1">
                  <div className="flex min-w-0 flex-1 flex-col">
                    {profilePageId ? (
                      <PageFrame>
                        <ProfilePage
                          profileId={profilePageId}
                          onClose={() => setProfilePageId(null)}
                          onOpenDM={(id) => void openDM(id)}
                          onCall={(id, video) => void callUser(id, video)}
                          onEditProfile={() => setSettingsOpen(true)}
                          onOpenMessages={() => changeSection("messages")}
                          onOpenProject={(p) => {
                            if (servers.some((s) => s.id === p.id)) {
                              selectWorkspace(p.id);
                              changeSection("dashboard");
                            } else {
                              void navigate({ to: "/p/$projectId", params: { projectId: p.id } });
                            }
                          }}
                        />
                      </PageFrame>
                    ) : needsWorkspace ? (
                      <WelcomeScreen
                        name={
                          (profile?.display_name || profile?.username || "").split(" ")[0] ?? ""
                        }
                        onCreate={() => setCreateOpen(true)}
                      />
                    ) : section === "dashboard" && workspace ? (
                      <PageFrame>
                        <Dashboard
                          key={workspace.id}
                          workspace={workspace}
                          members={members}
                          teams={teams}
                          invites={invites}
                          profiles={profiles_}
                          userId={userId ?? ""}
                          canManage={canManage}
                          canReview={isWorkspaceOwner}
                          onInvite={openInvite}
                          onCreateTeam={() => setCreateTeamOpen(true)}
                          onJoinVoice={openVoice}
                          onOpenChannel={(channelId) => {
                            setSelection({ kind: "channel", serverId: workspace.id, channelId });
                            setSection("rooms");
                            setRoomsGrid(false);
                          }}
                          onNavigate={changeSection}
                          onOpenProfile={setProfilePageId}
                          requests={requests}
                          questions={project?.access_questions ?? []}
                        />
                      </PageFrame>
                    ) : section === "team" && workspace ? (
                      <PageFrame scroll>
                        <TeamManager
                          workspace={workspace}
                          members={members}
                          teams={teams}
                          invites={invites}
                          profiles={profiles_}
                          userId={userId ?? ""}
                          canManage={canManage}
                          onInvite={openInvite}
                          onCreateTeam={() => setCreateTeamOpen(true)}
                          onOpenProfile={setProfilePageId}
                        />
                      </PageFrame>
                    ) : section === "tasks" ? (
                      <PageFrame>
                        <ComingSoon
                          pose="energia"
                          title="Tasks da equipe"
                          body="Distribua o trabalho do dia, acompanhe o que travou e veja a semana de cada equipe num quadro só."
                          bullets={[
                            "Criar tasks e atribuir para pessoas ou equipes",
                            "Quadro por status: a fazer, fazendo, feito",
                            "Prazos, prioridade e o que cada um puxou hoje",
                          ]}
                        />
                      </PageFrame>
                    ) : section === "rooms" && roomsGrid && workspace ? (
                      <PageFrame>
                        <RoomsBoard
                          key={workspace.id}
                          workspace={workspace}
                          channels={channels}
                          members={members}
                          profiles={profiles_}
                          userId={userId ?? ""}
                          isAdmin={canManage}
                          rooms={rooms}
                          expired={expiredRooms}
                          currentChannelId={voice?.channelId ?? null}
                          onEnter={openVoice}
                          onOpenText={(channelId) => {
                            setSelection({ kind: "channel", serverId: workspace.id, channelId });
                            setRoomsGrid(false);
                          }}
                        />
                      </PageFrame>
                    ) : section === "messages" ? (
                      /*
                       * Mensagens: a coluna das conversas e o chat em balões
                       * num painel branco dentro da moldura das páginas. No
                       * celular, uma coisa de cada vez, com voltar no cabeçalho.
                       */
                      <PageFrame className="p-2">
                        <div className="flex min-h-0 flex-1 overflow-hidden rounded-[28px] bg-card">
                          <ConversationList
                            conversations={conversations}
                            selection={selection}
                            friendsActive={selection.kind !== "dm"}
                            workspace={workspace}
                            onSelect={(next) => {
                              setFriendsPane(false);
                              setSelection(next);
                            }}
                            onOpenDM={(id) => {
                              setFriendsPane(false);
                              void openDM(id);
                            }}
                            onOpenFriends={() => {
                              setSelection({ kind: "friends" });
                              setFriendsPane(true);
                            }}
                            footer={
                              voiceDock ? (
                                <div className="border-t border-foreground/[0.06]">{userBar}</div>
                              ) : null
                            }
                            className={cn(
                              "w-full md:w-[300px] md:shrink-0 md:border-r md:border-foreground/[0.07] xl:w-[320px]",
                              (activeConversation || friendsPane) && "hidden md:flex",
                            )}
                          />

                          <main
                            className={cn(
                              "min-w-0 flex-1 flex-col overflow-hidden",
                              activeConversation || friendsPane ? "flex" : "hidden md:flex",
                            )}
                          >
                            {!activeConversation && (
                              <>
                                <div className="flex h-12 shrink-0 items-center border-b border-foreground/[0.06] px-2 md:hidden">
                                  <button
                                    type="button"
                                    onClick={() => setFriendsPane(false)}
                                    className="flex h-9 items-center gap-1 rounded-full px-2 text-[14px] font-medium transition-colors hover:bg-secondary"
                                  >
                                    <ArrowLeft2 size={17} color="currentColor" /> Conversas
                                  </button>
                                </div>
                                <FriendsPanel
                                  onOpenDM={(id) => void openDM(id)}
                                  onSelectProfile={setProfilePageId}
                                  onCall={(id, video) => void callUser(id, video)}
                                />
                              </>
                            )}

                            {/* Numa call da conversa o palco divide a tela com o chat. */}
                            {activeConversation &&
                              voice?.conversationId === activeConversation.id && (
                                <div className="flex h-[45%] shrink-0 flex-col border-b border-foreground/[0.06]">
                                  <VoiceStage
                                    title={voice.label}
                                    rtc={rtc}
                                    profiles={profiles}
                                    selfProfile={profile ?? undefined}
                                    onLeave={() => setVoice(null)}
                                  />
                                </div>
                              )}

                            {activeConversation && (
                              <ChatPanel
                                key={activeConversation.id}
                                variant="bubbles"
                                showAuthors={activeConversation.is_group}
                                scopeKey={activeConversation.id}
                                conversationId={activeConversation.id}
                                placeholder="Escreva uma mensagem…"
                                header={(typing) => (
                                  <DirectChatHeader
                                    conversation={activeConversation}
                                    profiles={profiles}
                                    selfId={userId}
                                    typing={typing}
                                    inCall={voice?.conversationId === activeConversation.id}
                                    onBack={() => {
                                      setFriendsPane(false);
                                      setSelection({ kind: "friends" });
                                    }}
                                    onCall={startCall}
                                    onOpenProfile={setProfilePageId}
                                  />
                                )}
                              />
                            )}
                          </main>

                          {!profileId && !activeConversation && (
                            <div className="hidden min-h-0 2xl:flex">
                              <ActivityPanel onSelectProfile={setProfilePageId} />
                            </div>
                          )}
                        </div>
                      </PageFrame>
                    ) : (
                      <>
                        {section === "rooms" && selection.kind !== "voice" && (
                          <div className="flex shrink-0 px-5 pt-1 sm:px-7 lg:pl-2">
                            <button
                              type="button"
                              onClick={() => setRoomsGrid(true)}
                              className="-ml-2 flex h-8 items-center gap-1 rounded-full px-2 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <ArrowLeft2 size={15} color="currentColor" /> Todas as salas
                            </button>
                          </div>
                        )}
                        {/*
                         * Numa sala, só a ligação, como no Meet: nada de lista de
                         * canais nem cara de comunidade. A conversa da sala abre
                         * ao lado da call pelo botão de chat.
                         */}
                        <div
                          className={cn(
                            "flex min-h-0 flex-1 overflow-hidden",
                            // A ligação fica sem moldura; o resto usa a das páginas.
                            section === "rooms" && selection.kind === "voice"
                              ? cn("mx-3 mb-3 sm:mx-7 sm:mb-6", inCall ? "mt-0 lg:mt-1" : "mt-2")
                              : "ws-frame mx-3 mb-3 mt-1 gap-2 p-2 sm:mx-5 sm:mb-5 lg:ml-0 lg:mr-5",
                          )}
                        >
                          {section === "rooms" ? null : (
                            <HomeSidebar
                              conversations={conversations}
                              servers={servers}
                              selection={selection}
                              onSelect={(next) => {
                                setSelection(next);
                                if (next.kind === "channel" || next.kind === "voice") {
                                  setWorkspaceId(next.serverId);
                                  setSection("rooms");
                                }
                              }}
                              onOpenDM={(id) => void openDM(id)}
                              onOpenServer={(id) => void openServer(id)}
                              footer={userBar}
                            />
                          )}

                          <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-card">
                            {section === "rooms" && selection.kind === "voice" && voiceChannel && (
                              <VoiceStage
                                title={voiceChannel.name}
                                rtc={rtc}
                                profiles={profiles}
                                selfProfile={profile ?? undefined}
                                onLeave={() => {
                                  setVoice(null);
                                  setRoomsGrid(true);
                                }}
                                connected={voice?.channelId === voiceChannel.id}
                                members={voiceChannelMembers}
                                onJoin={() => openVoice(voiceChannel)}
                                onBack={() => setRoomsGrid(true)}
                                hostId={rooms.settings.get(voiceChannel.id)?.created_by ?? null}
                                onInvite={() => {
                                  const link = `${window.location.origin}/app?sala=${voiceChannel.id}`;
                                  void navigator.clipboard
                                    .writeText(link)
                                    .then(() => toast.success("Link da sala copiado."))
                                    .catch(() => toast.error("Não foi possível copiar o link."));
                                }}
                                chat={
                                  <ChatPanel
                                    scopeKey={`room-${voiceChannel.id}`}
                                    channelId={voiceChannel.id}
                                    placeholder="Escreva uma mensagem…"
                                    variant="stage"
                                    header={null}
                                  />
                                }
                              />
                            )}

                            {section === "rooms" &&
                              selection.kind === "channel" &&
                              activeChannel && (
                                <ChatPanel
                                  scopeKey={activeChannel.id}
                                  channelId={activeChannel.id}
                                  placeholder={`Conversar em #${activeChannel.name}`}
                                  header={
                                    <span className="flex min-w-0 items-center gap-2">
                                      {activeChannel.kind === "voice" ? (
                                        <Volume2
                                          size={20}
                                          className="shrink-0 text-muted-foreground"
                                        />
                                      ) : (
                                        <Hash
                                          size={20}
                                          className="shrink-0 text-muted-foreground"
                                        />
                                      )}
                                      <span className="truncate text-base font-semibold">
                                        {activeChannel.name}
                                      </span>
                                    </span>
                                  }
                                />
                              )}
                          </main>
                        </div>
                      </>
                    )}
                  </div>

                  {profileAside && (
                    <div className="mb-3 mr-3 mt-2 flex shrink-0 sm:mb-6 sm:mr-7">
                      {profileAside}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent
              side="left"
              className="flex w-[86vw] max-w-[320px] flex-col overflow-y-auto border-r-0 px-3 pb-4 pt-14 clyro-scroll"
            >
              <SheetTitle className="sr-only">Menu</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>

          {/* Fora das salas a call continua visível num cartão flutuante. */}
          {voice &&
            (((section !== "rooms" || roomsGrid) && section !== "messages") || profilePageId) && (
              <div className="fixed bottom-6 right-6 z-40 w-72 overflow-hidden rounded-[22px] border border-border bg-card shadow-card clyro-pop-in">
                {voiceDock}
              </div>
            )}
        </div>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        {userId && (
          <ProjectDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            userId={userId}
            onSaved={(id) => {
              void qc.invalidateQueries({ queryKey: ["servers", userId] });
              setWorkspaceId(id);
              setSection("dashboard");
            }}
          />
        )}
        {workspace && userId && project && (
          <ProjectDialog
            open={editProjectOpen}
            onOpenChange={setEditProjectOpen}
            userId={userId}
            project={project}
            onSaved={() => void qc.invalidateQueries({ queryKey: ["servers", userId] })}
          />
        )}
        {workspace && userId && (
          <>
            <InviteDialog
              key={`${workspace.id}-${invite?.teamId ?? "none"}`}
              open={!!invite}
              onOpenChange={(open) => !open && setInvite(null)}
              workspace={workspace}
              teams={teams}
              memberIds={memberIds}
              userId={userId}
              defaultTeamId={invite?.teamId ?? null}
            />
            <CreateTeamDialog
              open={createTeamOpen}
              onOpenChange={setCreateTeamOpen}
              workspaceId={workspace.id}
              userId={userId}
            />
          </>
        )}
      </VoicePresenceProvider>
    </TooltipProvider>
  );
}
