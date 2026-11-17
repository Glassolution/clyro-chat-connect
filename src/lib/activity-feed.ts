import { useMemo } from "react";
import { useChannels } from "@/lib/clyro-queries";
import { useVoiceStates } from "@/lib/voice-presence";
import type { Server } from "@/lib/clyro-types";
import type { Team, WorkspaceInvite, WorkspaceMember } from "@/lib/workspace-queries";
import type { AccessRequest } from "@/lib/project-queries";
import {
  useMeetings,
  useRecentMessages,
  useTasks,
  useVoiceJoins,
  type Meeting,
  type Task,
} from "@/lib/activity-queries";

/* ------------------------------------------------------------------ */
/* Dados compartilhados entre o feed e a coluna lateral.               */
/* ------------------------------------------------------------------ */

export function useBoardData(workspace: Server) {
  const { data: channels = [] } = useChannels(workspace.id);
  const voiceChannels = useMemo(() => channels.filter((c) => c.kind === "voice"), [channels]);
  const textIds = useMemo(
    () => channels.filter((c) => c.kind === "text").map((c) => c.id),
    [channels],
  );
  const voiceIds = useMemo(() => new Set(voiceChannels.map((c) => c.id)), [voiceChannels]);
  const states = useVoiceStates();
  const live = useMemo(
    () =>
      voiceChannels
        .map((channel) => ({
          channel,
          userIds: states.filter((s) => s.channel_id === channel.id).map((s) => s.user_id),
        }))
        .filter((r) => r.userIds.length > 0),
    [voiceChannels, states],
  );
  const { data: taskData } = useTasks(workspace.id);
  const { data: meetingData } = useMeetings(workspace.id);
  return {
    channels,
    voiceChannels,
    textIds,
    voiceIds,
    states,
    live,
    tasks: taskData?.tasks ?? [],
    meetings: meetingData?.meetings ?? [],
    missing: Boolean(taskData?.missing || meetingData?.missing),
  };
}

export type BoardData = ReturnType<typeof useBoardData>;

/* ------------------------------------------------------------------ */
/* O feed: cada coisa que o time fez vira um cartão.                    */
/* ------------------------------------------------------------------ */

export type FeedKind = "call" | "message" | "task" | "people";

export const FEED_FILTERS: { id: FeedKind | "all"; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "call", label: "Calls e reuniões" },
  { id: "message", label: "Mensagens" },
  { id: "task", label: "Tasks" },
  { id: "people", label: "Pessoas" },
];

export type FeedSource =
  | { type: "join"; member: WorkspaceMember }
  | { type: "voice"; channelId: string }
  | { type: "message"; channelId: string; content: string }
  | { type: "assigned"; task: Task }
  | { type: "done"; task: Task }
  | { type: "meeting"; meeting: Meeting }
  | { type: "team"; team: Team }
  | { type: "invite"; invite: WorkspaceInvite }
  | { type: "request"; request: AccessRequest };

export type FeedEvent = {
  key: string;
  at: number;
  actor: string | null;
  kind: FeedKind;
  source: FeedSource;
};

export function useFeed(props: {
  workspace: Server;
  members: WorkspaceMember[];
  teams: Team[];
  invites: WorkspaceInvite[];
  requests: AccessRequest[];
  canManage: boolean;
}) {
  const data = useBoardData(props.workspace);
  const voiceJoins = useVoiceJoins(data.states, data.voiceIds);
  const { data: messages = [] } = useRecentMessages(data.textIds);
  const { members, teams, invites, requests, canManage } = props;

  // Lista curta e barata: recalcula a cada render, sem memo.
  const events: FeedEvent[] = [];
  members.forEach((m) =>
    events.push({
      key: `join-${m.user_id}`,
      at: +new Date(m.joined_at),
      actor: m.user_id,
      kind: "people",
      source: { type: "join", member: m },
    }),
  );
  voiceJoins.forEach((j) =>
    events.push({
      key: `voice-${j.userId}-${j.at}`,
      at: j.at,
      actor: j.userId,
      kind: "call",
      source: { type: "voice", channelId: j.channelId },
    }),
  );
  messages.forEach((msg) =>
    events.push({
      key: `msg-${msg.id}`,
      at: +new Date(msg.created_at),
      actor: msg.author_id,
      kind: "message",
      source: { type: "message", channelId: msg.channel_id, content: msg.content },
    }),
  );
  data.tasks.forEach((t) => {
    if (t.assignee_id && t.assignee_id !== t.created_by) {
      events.push({
        key: `task-${t.id}`,
        at: +new Date(t.created_at),
        actor: t.created_by,
        kind: "task",
        source: { type: "assigned", task: t },
      });
    }
    if (t.status === "done" && t.completed_at) {
      events.push({
        key: `done-${t.id}`,
        at: +new Date(t.completed_at),
        actor: t.assignee_id ?? t.created_by,
        kind: "task",
        source: { type: "done", task: t },
      });
    }
  });
  data.meetings.forEach((m) =>
    events.push({
      key: `meet-${m.id}`,
      at: +new Date(m.created_at),
      actor: m.created_by,
      kind: "call",
      source: { type: "meeting", meeting: m },
    }),
  );
  teams.forEach((t) =>
    events.push({
      key: `team-${t.id}`,
      at: +new Date(t.created_at),
      actor: t.created_by,
      kind: "people",
      source: { type: "team", team: t },
    }),
  );
  invites
    .filter((i) => i.status === "pending")
    .forEach((i) =>
      events.push({
        key: `inv-${i.id}`,
        at: +new Date(i.created_at),
        actor: i.invited_by,
        kind: "people",
        source: { type: "invite", invite: i },
      }),
    );
  if (canManage) {
    requests.forEach((req) =>
      events.push({
        key: `req-${req.id}`,
        at: +new Date(req.created_at),
        actor: req.user_id,
        kind: "people",
        source: { type: "request", request: req },
      }),
    );
  }

  return {
    data,
    events: events.filter((e) => Number.isFinite(e.at)).sort((a, b) => b.at - a.at),
  };
}
