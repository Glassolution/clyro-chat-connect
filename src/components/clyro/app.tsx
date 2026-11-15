import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Volume2, Phone, Video, AtSign } from "@/components/icons";
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
import { ServerSidebar } from "./server-sidebar";
import { ChatPanel } from "./chat";
import { FriendsPanel } from "./friends";
import { ActivityPanel } from "./activity";
import { ProfilePanel } from "./profile-panel";
import { VoiceStage, VoiceDock } from "./voice-stage";
import { VoiceAudio } from "./media";
import { UserBar } from "./user-bar";
import { SettingsDialog } from "./settings-dialog";
import { NavRail, type Section } from "@/components/workspace/nav-rail";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { Dashboard } from "@/components/workspace/dashboard";
import { TeamManager, CreateTeamDialog } from "@/components/workspace/team-panel";
import { InviteDialog } from "@/components/workspace/invite-dialog";
import { ProjectDialog } from "@/components/discover/project-dialog";
import { useProject, useProjectRequests } from "@/lib/project-queries";
import { useNavigate } from "@tanstack/react-router";
import { ComingSoon, IncomingInvites, WelcomeScreen } from "@/components/workspace/onboarding";

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
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => readSavedWorkspace());
  const [createOpen, setCreateOpen] = useState(false);
  const [invite, setInvite] = useState<{ teamId: string | null } | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
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
  const { data: project } = useProject(canManage ? activeServerId : null);
  const { data: requests = [] } = useProjectRequests(activeServerId, canManage);
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
    if (section === "rooms") void openServer(id);
    else if (section === "messages") setSection("dashboard");
  };

  const changeSection = (next: Section) => {
    setProfileId(null);
    if (next === "rooms" && workspace) {
      const inWorkspace =
        (selection.kind === "channel" || selection.kind === "voice") &&
        selection.serverId === workspace.id;
      if (!inWorkspace) {
        void openServer(workspace.id);
        return;
      }
    }
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
  const openVoice = (channel: Channel) => {
    setSelection({ kind: "voice", serverId: channel.server_id, channelId: channel.id });
    setSection("rooms");
    if (voice?.channelId === channel.id) return;
    setVoice({
      roomKey: `voice-channel-${channel.id}`,
      label: channel.name,
      channelId: channel.id,
      serverId: channel.server_id,
      conversationId: null,
    });
  };

  const activeConversation = useMemo(
    () =>
      selection.kind === "dm"
        ? (conversations.find((c) => c.id === selection.conversationId) ?? null)
        : null,
    [conversations, selection],
  );

  /**
   * Quem está falando agora, por usuário — o mesmo sinal que acende a borda no
   * palco alimenta a bola verde da lista lateral e a do próprio perfil.
   */
  const speakingUserIds = useMemo(() => {
    const ids = rtc.peers.filter((p) => p.speaking).map((p) => p.userId);
    if (rtc.localSpeaking && !rtc.muted && userId) ids.push(userId);
    return ids;
  }, [rtc.peers, rtc.localSpeaking, rtc.muted, userId]);

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

  // Abrir uma conversa 1:1 já mostra o perfil de quem está do outro lado; fechar
  // o painel mantém ele fechado até trocar de conversa ou clicar em outro card.
  const dmPartnerId =
    activeConversation && !activeConversation.is_group
      ? (activeConversation.member_ids.find((id) => id !== userId) ?? null)
      : null;

  useEffect(() => {
    // Trocar de tela devolve o painel ao padrão daquela tela: numa DM, o perfil
    // de quem está do outro lado; nas demais, nada. Cliques posteriores em cards
    // ou na lista de voz continuam mandando, porque não mexem nestas deps.
    setProfileId(dmPartnerId);
  }, [selection, dmPartnerId]);

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

  const sectionTitle: Record<Section, string> = {
    dashboard: "Painel",
    tasks: "Tasks",
    rooms: "Salas",
    messages: "Mensagens",
    team: "Equipe",
  };

  // Telas que vivem dentro de um workspace: sem nenhum, a primeira coisa é criar.
  const needsWorkspace = section !== "messages" && !workspace;

  const profileAside = profileId ? (
    <ProfilePanel
      profileId={profileId}
      onClose={() => setProfileId(null)}
      onOpenDM={(id) => void openDM(id)}
      onCall={(id, video) => void callUser(id, video)}
    />
  ) : null;

  return (
    <TooltipProvider delayDuration={200}>
      <VoicePresenceProvider value={voiceStates}>
        <div className="flex h-screen w-full overflow-hidden bg-card text-foreground">
          <NavRail
            section={section}
            onSection={changeSection}
            badges={{ dashboard: incoming.length + requests.length }}
            profile={profile ?? undefined}
            speaking={selfSpeaking}
            onSettings={() => setSettingsOpen(true)}
            onProfile={() => userId && setProfileId(userId)}
          />

          {/* O áudio dos participantes fica fora de qualquer tela: a call continua
            tocando ao navegar entre painel, equipe e salas. */}
          {voice && <VoiceAudio peers={rtc.peers} deafened={rtc.deafened} />}

          <div className="flex min-w-0 flex-1 flex-col">
            {servers.length > 0 && (
              <WorkspaceTabs
                title={sectionTitle[section]}
                workspaces={servers}
                activeId={section === "messages" ? null : (workspace?.id ?? null)}
                onSelect={selectWorkspace}
                onCreate={() => setCreateOpen(true)}
              />
            )}

            {(section === "dashboard" || needsWorkspace) && (
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
                {needsWorkspace ? (
                  <WelcomeScreen
                    name={(profile?.display_name || profile?.username || "").split(" ")[0] ?? ""}
                    onCreate={() => setCreateOpen(true)}
                  />
                ) : section === "dashboard" && workspace ? (
                  <Dashboard
                    workspace={workspace}
                    profile={profile ?? undefined}
                    members={members}
                    teams={teams}
                    invites={invites}
                    profiles={profiles_}
                    userId={userId ?? ""}
                    canManage={canManage}
                    unread={0}
                    onInvite={openInvite}
                    onCreateTeam={() => setCreateTeamOpen(true)}
                    onOpenRooms={() => changeSection("rooms")}
                    onOpenProfile={setProfileId}
                    onLeft={() => setWorkspaceId(null)}
                    requests={requests}
                    questions={project?.access_questions ?? []}
                    onEditProject={() => setEditProjectOpen(true)}
                    onViewProject={() =>
                      void navigate({ to: "/p/$projectId", params: { projectId: workspace.id } })
                    }
                  />
                ) : section === "team" && workspace ? (
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 sm:px-8 clyro-scroll">
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
                      onOpenProfile={setProfileId}
                    />
                  </div>
                ) : section === "tasks" ? (
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
                ) : (
                  <div className="mx-3 mb-3 flex min-h-0 flex-1 overflow-hidden rounded-[28px] border border-border bg-card sm:mx-6 sm:mb-6">
                    {section === "rooms" && activeServer ? (
                      <ServerSidebar
                        server={activeServer}
                        channels={channels}
                        selection={selection}
                        onSelect={setSelection}
                        onOpenVoice={openVoice}
                        onSelectProfile={setProfileId}
                        activeVoiceChannelId={voice?.channelId ?? null}
                        speakingUserIds={speakingUserIds}
                        currentUserId={userId ?? ""}
                        onIconChanged={() =>
                          void qc.invalidateQueries({ queryKey: ["servers", userId] })
                        }
                        footer={userBar}
                      />
                    ) : (
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

                    <main className="flex min-w-0 flex-1 flex-col bg-background/40">
                      {section === "rooms" && selection.kind === "voice" && voiceChannel && (
                        <VoiceStage
                          title={voiceChannel.name}
                          subtitle={activeServer?.name}
                          rtc={rtc}
                          profiles={profiles}
                          selfProfile={profile ?? undefined}
                          onLeave={() => setVoice(null)}
                          connected={voice?.channelId === voiceChannel.id}
                          members={voiceChannelMembers}
                          onJoin={() => openVoice(voiceChannel)}
                        />
                      )}

                      {section === "rooms" && selection.kind === "channel" && activeChannel && (
                        <ChatPanel
                          scopeKey={activeChannel.id}
                          channelId={activeChannel.id}
                          placeholder={`Conversar em #${activeChannel.name}`}
                          header={
                            <span className="flex min-w-0 items-center gap-2">
                              {activeChannel.kind === "voice" ? (
                                <Volume2 size={20} className="shrink-0 text-muted-foreground" />
                              ) : (
                                <Hash size={20} className="shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate text-base font-semibold">
                                {activeChannel.name}
                              </span>
                            </span>
                          }
                        />
                      )}

                      {section === "messages" && selection.kind !== "dm" && (
                        <FriendsPanel
                          onOpenDM={(id) => void openDM(id)}
                          onSelectProfile={setProfileId}
                          onCall={(id, video) => void callUser(id, video)}
                        />
                      )}

                      {/* Numa call de DM o palco divide a tela com o chat. */}
                      {section === "messages" &&
                        activeConversation &&
                        voice?.conversationId === activeConversation.id && (
                          <div className="flex h-[45%] shrink-0 flex-col border-b border-border">
                            <VoiceStage
                              title={voice.label}
                              rtc={rtc}
                              profiles={profiles}
                              selfProfile={profile ?? undefined}
                              onLeave={() => setVoice(null)}
                            />
                          </div>
                        )}

                      {section === "messages" && activeConversation && (
                        <ChatPanel
                          scopeKey={activeConversation.id}
                          conversationId={activeConversation.id}
                          placeholder={`Conversar em ${conversationTitle(activeConversation, profiles, userId)}`}
                          header={
                            <>
                              <span className="flex min-w-0 items-center gap-2">
                                <AtSign size={15} className="shrink-0 text-muted-foreground" />
                                <span className="truncate text-base font-semibold">
                                  {conversationTitle(activeConversation, profiles, userId)}
                                </span>
                              </span>
                              <div className="ml-auto flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Chamada de voz"
                                  onClick={() => startCall(false)}
                                >
                                  <Phone size={16} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Chamada de vídeo"
                                  onClick={() => startCall(true)}
                                >
                                  <Video size={16} />
                                </Button>
                              </div>
                            </>
                          }
                        />
                      )}
                    </main>

                    {!profileId && section === "messages" && selection.kind !== "dm" && (
                      <ActivityPanel onSelectProfile={setProfileId} />
                    )}
                  </div>
                )}
              </div>

              {profileAside && (
                <div className="mb-3 mr-3 flex shrink-0 overflow-hidden rounded-[28px] border border-border sm:mb-6 sm:mr-6">
                  {profileAside}
                </div>
              )}
            </div>
          </div>

          {/* Fora das salas a call continua visível num cartão flutuante. */}
          {voice && section !== "rooms" && section !== "messages" && (
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

const WORKSPACE_KEY = "clyro:workspace";

function readSavedWorkspace() {
  try {
    return window.localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function saveWorkspace(id: string) {
  try {
    window.localStorage.setItem(WORKSPACE_KEY, id);
  } catch {
    /* navegador sem armazenamento: só não lembra o último workspace */
  }
}
