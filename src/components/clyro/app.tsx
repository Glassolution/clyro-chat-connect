import { useEffect, useMemo, useState } from "react";
import { Hash, Volume2, Users, Phone, Video, AtSign } from "lucide-react";
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
import type { Channel, Selection } from "@/lib/clyro-types";
import { useQueryClient } from "@tanstack/react-query";
import { ServerRail } from "./rail";
import { HomeSidebar, conversationTitle } from "./home-sidebar";
import { ServerSidebar } from "./server-sidebar";
import { ChatPanel } from "./chat";
import { FriendsPanel } from "./friends";
import { ActivityPanel } from "./activity";
import { VoiceStage } from "./voice-stage";
import { UserBar } from "./user-bar";

type VoiceSession = {
  roomKey: string;
  label: string;
  channelId: string | null;
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
  const [selection, setSelection] = useState<Selection>({ kind: "friends" });
  const [voice, setVoice] = useState<VoiceSession | null>(null);

  const activeServerId = selection.kind === "channel" ? selection.serverId : null;
  const { data: channels = [] } = useChannels(activeServerId);
  const activeServer = servers.find((s) => s.id === activeServerId) ?? null;
  const rtc = useVoiceRoom(voice?.roomKey ?? null, userId ?? null);

  // Publish presence in the voice room so everyone sees who is connected.
  useEffect(() => {
    if (!userId) return;
    if (!voice) {
      void supabase.from("voice_states").delete().eq("user_id", userId);
      return;
    }
    void supabase.from("voice_states").upsert({
      user_id: userId,
      channel_id: voice.channelId,
      conversation_id: voice.conversationId,
      muted: rtc.muted,
      deafened: rtc.deafened,
      sharing_screen: rtc.sharingScreen,
      camera_on: rtc.cameraOn,
    });
  }, [userId, voice, rtc.muted, rtc.deafened, rtc.sharingScreen, rtc.cameraOn]);

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from("profiles")
      .update({ activity: voice ? `Em call · ${voice.label}` : null })
      .eq("id", userId);
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

  const openDM = async (friendId: string) => {
    if (!userId) return;
    const existing = conversations.find(
      (c) => !c.is_group && c.member_ids.length === 2 && c.member_ids.includes(friendId),
    );
    if (existing) {
      setSelection({ kind: "dm", conversationId: existing.id });
      return;
    }
    const { data, error } = await supabase
      .from("conversations")
      .insert({ is_group: false, created_by: userId })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível abrir a conversa.");
      return;
    }
    await supabase.from("conversation_members").insert([
      { conversation_id: data.id, user_id: userId },
      { conversation_id: data.id, user_id: friendId },
    ]);
    await qc.invalidateQueries({ queryKey: ["conversations", userId] });
    setSelection({ kind: "dm", conversationId: data.id });
  };

  const joinVoiceChannel = (channel: Channel) => {
    if (voice?.channelId === channel.id) {
      setVoice(null);
      return;
    }
    setVoice({
      roomKey: `voice-channel-${channel.id}`,
      label: channel.name,
      channelId: channel.id,
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
    selection.kind === "channel" ? (channels.find((c) => c.id === selection.channelId) ?? null) : null;

  const startCall = (video: boolean) => {
    if (!activeConversation) return;
    setVoice({
      roomKey: `voice-dm-${activeConversation.id}`,
      label: conversationTitle(activeConversation, profiles, userId),
      channelId: null,
      conversationId: activeConversation.id,
    });
    if (video) void rtc.toggleCamera();
  };

  const userBar = (
    <UserBar
      muted={rtc.muted}
      deafened={rtc.deafened}
      inVoice={!!voice}
      onToggleMute={rtc.toggleMute}
      onToggleDeafen={rtc.toggleDeafen}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-full overflow-hidden bg-surface text-foreground">
        <ServerRail
          servers={servers}
          activeServerId={activeServerId}
          onHome={() => setSelection({ kind: "friends" })}
          onSelectServer={(id) => void openServer(id)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ["servers", userId] })}
          userId={userId ?? ""}
        />

        {activeServer ? (
          <ServerSidebar
            server={activeServer}
            channels={channels}
            selection={selection}
            onSelect={setSelection}
            onJoinVoice={joinVoiceChannel}
            activeVoiceChannelId={voice?.channelId ?? null}
            footer={userBar}
          />
        ) : (
          <HomeSidebar
            conversations={conversations}
            selection={selection}
            onSelect={setSelection}
            footer={userBar}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          {voice && (
            <VoiceStage
              title={voice.label}
              rtc={rtc}
              profiles={profiles}
              selfProfile={profile ?? undefined}
              onLeave={() => setVoice(null)}
            />
          )}

          {selection.kind === "friends" && (
            <section className="flex min-h-0 flex-1 flex-col bg-surface">
              <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
                <Users size={16} />
                <span className="text-sm font-semibold">Amigos</span>
              </header>
              <FriendsPanel onOpenDM={(id) => void openDM(id)} />
            </section>
          )}

          {selection.kind === "dm" && activeConversation && (
            <ChatPanel
              scopeKey={activeConversation.id}
              conversationId={activeConversation.id}
              placeholder={`Conversar em ${conversationTitle(activeConversation, profiles, userId)}`}
              header={
                <>
                  <AtSign size={16} className="text-muted-foreground" />
                  <span className="truncate text-sm font-semibold">
                    {conversationTitle(activeConversation, profiles, userId)}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="Chamada de voz" onClick={() => startCall(false)}>
                      <Phone size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Chamada de vídeo" onClick={() => startCall(true)}>
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
                <>
                  {activeChannel.kind === "voice" ? (
                    <Volume2 size={16} className="text-muted-foreground" />
                  ) : (
                    <Hash size={16} className="text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-semibold">{activeChannel.name}</span>
                </>
              }
            />
          )}
        </main>

        <ActivityPanel />
      </div>
    </TooltipProvider>
  );
}
