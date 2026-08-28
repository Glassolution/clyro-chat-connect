import { useEffect, useMemo, useState } from "react";
import { Hash, Volume2, Phone, Video, AtSign } from "lucide-react";
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
  useVoiceStates,
} from "@/lib/clyro-queries";
import { useVoiceRoom } from "@/lib/useVoiceRoom";
import type { Channel, Profile, Selection } from "@/lib/clyro-types";
import { useQueryClient } from "@tanstack/react-query";
import { ServerRail } from "./rail";
import { HomeSidebar, conversationTitle, dedupeDirectConversations } from "./home-sidebar";
import { ServerSidebar } from "./server-sidebar";
import { ChatPanel } from "./chat";
import { FriendsPanel } from "./friends";
import { DiscoverPanel } from "./discover";
import { ActivityPanel } from "./activity";
import { ProfilePanel } from "./profile-panel";
import { VoiceStage, VoiceDock } from "./voice-stage";
import { VoiceAudio } from "./media";
import { UserBar } from "./user-bar";

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
  const { data: voiceStates = [] } = useVoiceStates();
  const [selection, setSelection] = useState<Selection>({ kind: "discover" });
  const [voice, setVoice] = useState<VoiceSession | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);

  const activeServerId =
    selection.kind === "channel" || selection.kind === "voice" ? selection.serverId : null;
  const { data: channels = [] } = useChannels(activeServerId);
  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;
  const rtc = useVoiceRoom(voice?.roomKey ?? null, userId ?? null);

  // Publica a presença na sala para todo mundo ver quem está conectado. O erro
  // era engolido por um `void`: quando a escrita falhava, a lista simplesmente
  // ficava vazia sem nenhum sinal.
  useEffect(() => {
    if (!userId) return;

    const publish = async () => {
      if (!voice) {
        const { error } = await supabase.from("voice_states").delete().eq("user_id", userId);
        if (error) console.error("[clyro] falha ao sair da sala de voz", error);
        return;
      }
      const { error } = await supabase.from("voice_states").upsert({
        user_id: userId,
        channel_id: voice.channelId,
        conversation_id: voice.conversationId,
        muted: rtc.muted,
        deafened: rtc.deafened,
        sharing_screen: rtc.sharingScreen,
        camera_on: rtc.cameraOn,
      });
      if (error) {
        console.error("[clyro] falha ao publicar presença de voz", error);
        toast.error("Você entrou na call, mas os outros não vão te ver na lista.");
        return;
      }
      // A confirmação por realtime pode demorar; atualiza a lista local na hora.
      await qc.invalidateQueries({ queryKey: ["voice-states"] });
    };

    void publish();
  }, [userId, voice, qc, rtc.muted, rtc.deafened, rtc.sharingScreen, rtc.cameraOn]);

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

  const openServer = async (serverId: string) => {
    const { data } = await supabase
      .from("channels")
      .select("id, kind, position")
      .eq("server_id", serverId)
      .eq("kind", "text")
      .order("position")
      .limit(1);
    const first = data?.[0];
    if (first) setSelection({ kind: "channel", serverId, channelId: first.id });
    else setSelection({ kind: "friends" });
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
      setSelection({ kind: "voice", serverId: voice.serverId, channelId: voice.channelId });
    } else if (voice.conversationId) {
      setSelection({ kind: "dm", conversationId: voice.conversationId });
    }
  };

  const userBar = (
    <>
      {voice && (
        <VoiceDock
          title={voice.label}
          subtitle={activeServer?.name}
          rtc={rtc}
          onOpen={openVoiceView}
          onLeave={() => setVoice(null)}
        />
      )}
      <UserBar
        muted={rtc.muted}
        deafened={rtc.deafened}
        inVoice={!!voice}
        onToggleMute={rtc.toggleMute}
        onToggleDeafen={rtc.toggleDeafen}
      />
    </>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-full overflow-hidden bg-surface text-foreground">
        <ServerRail
          servers={servers}
          activeServerId={activeServerId}
          homeActive={selection.kind === "friends" || selection.kind === "dm"}
          discoverActive={selection.kind === "discover"}
          onHome={() => setSelection({ kind: "friends" })}
          onDiscover={() => setSelection({ kind: "discover" })}
          onSelectServer={(id) => void openServer(id)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ["servers", userId] })}
          userId={userId ?? ""}
        />

        {/* A vitrine ocupa a largura inteira: nela não existe barra lateral. */}
        {activeServer ? (
          <ServerSidebar
            server={activeServer}
            channels={channels}
            selection={selection}
            onSelect={setSelection}
            onOpenVoice={openVoice}
            onSelectProfile={setProfileId}
            activeVoiceChannelId={voice?.channelId ?? null}
            footer={userBar}
          />
        ) : selection.kind === "discover" ? null : (
          <HomeSidebar
            conversations={conversations}
            servers={servers}
            selection={selection}
            onSelect={setSelection}
            onOpenDM={(id) => void openDM(id)}
            onOpenServer={(id) => void openServer(id)}
            footer={userBar}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {/* O áudio dos participantes fica aqui, fora do palco: assim a call
              continua tocando ao navegar para outro canal. */}
          {voice && <VoiceAudio peers={rtc.peers} deafened={rtc.deafened} />}

          {selection.kind === "voice" && voiceChannel && (
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

          {selection.kind === "friends" && (
            <FriendsPanel
              onOpenDM={(id) => void openDM(id)}
              onSelectProfile={setProfileId}
              onCall={(id, video) => void callUser(id, video)}
            />
          )}

          {selection.kind === "discover" && (
            <DiscoverPanel onOpenServer={(id) => void openServer(id)} />
          )}

          {/* Numa call de DM o palco divide a tela com o chat, para dar para
              conversar por escrito sem sair da chamada. */}
          {selection.kind === "dm" &&
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

          {selection.kind === "dm" && activeConversation && (
            <ChatPanel
              scopeKey={activeConversation.id}
              conversationId={activeConversation.id}
              placeholder={`Conversar em ${conversationTitle(activeConversation, profiles, userId)}`}
              header={
                <>
                  <span className="flex min-w-0 items-center gap-2 rounded-xl bg-panel px-3 py-1.5">
                    <AtSign size={15} className="shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
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

          {selection.kind === "channel" && activeChannel && (
            <ChatPanel
              scopeKey={activeChannel.id}
              channelId={activeChannel.id}
              placeholder={`Conversar em #${activeChannel.name}`}
              header={
                <span className="flex min-w-0 items-center gap-2 rounded-xl bg-panel px-3 py-1.5">
                  {activeChannel.kind === "voice" ? (
                    <Volume2 size={15} className="shrink-0 text-muted-foreground" />
                  ) : (
                    <Hash size={15} className="shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">{activeChannel.name}</span>
                </span>
              }
            />
          )}
        </main>

        {/* O perfil abre onde for pedido; "Ativo agora" fica só na aba de Amigos,
            para não roubar largura das outras telas. */}
        {profileId ? (
          <ProfilePanel
            profileId={profileId}
            onClose={() => setProfileId(null)}
            onOpenDM={(id) => void openDM(id)}
            onCall={(id, video) => void callUser(id, video)}
          />
        ) : selection.kind === "friends" ? (
          <ActivityPanel onSelectProfile={setProfileId} />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
