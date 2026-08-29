import type { Profile, PresenceStatus } from "@/hooks/useAuth";

export type { Profile, PresenceStatus };

export type Server = {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  invite_code: string;
};

export type Channel = {
  id: string;
  server_id: string;
  name: string;
  kind: "text" | "voice";
  position: number;
  /** null = fora de categoria, cai nos grupos padrão de texto/voz. */
  category_id: string | null;
};

export type ChannelCategory = {
  id: string;
  server_id: string;
  name: string;
  position: number;
};

export type Message = {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  is_group: boolean;
  name: string | null;
  created_by: string;
  member_ids: string[];
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
};

export type VoiceState = {
  user_id: string;
  channel_id: string | null;
  conversation_id: string | null;
  muted: boolean;
  deafened: boolean;
  sharing_screen: boolean;
  camera_on: boolean;
  /** Último sinal de vida; ausente enquanto a migração de heartbeat não rodar. */
  heartbeat_at?: string | null;
};

export type Selection =
  | { kind: "friends" }
  | { kind: "discover" }
  | { kind: "dm"; conversationId: string }
  | { kind: "channel"; serverId: string; channelId: string }
  | { kind: "voice"; serverId: string; channelId: string };

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Ausente",
  dnd: "Não perturbe",
  invisible: "Invisível",
};

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
