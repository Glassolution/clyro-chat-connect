import { Users, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useFriendships, useProfiles } from "@/lib/clyro-queries";
import type { Conversation, Profile, Selection } from "@/lib/clyro-types";
import { ClyroWordmark, UserAvatar } from "./primitives";

export function conversationTitle(
  conversation: Conversation,
  profiles: Map<string, Profile> | undefined,
  selfId: string | undefined,
) {
  if (conversation.name) return conversation.name;
  const others = conversation.member_ids.filter((id) => id !== selfId);
  const names = others.map((id) => {
    const p = profiles?.get(id);
    return p?.display_name || p?.username || "Usuário";
  });
  return names.join(", ") || "Conversa";
}

export function HomeSidebar({
  conversations,
  selection,
  onSelect,
  footer,
}: {
  conversations: Conversation[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  footer: React.ReactNode;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { data: friendships = [] } = useFriendships(user?.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const friends = friendships
    .filter((f) => f.status === "accepted")
    .map((f) => profiles?.get(f.requester_id === user?.id ? f.addressee_id : f.requester_id))
    .filter((p): p is Profile => !!p);

  const createGroup = async () => {
    if (!user || picked.length === 0) return;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ is_group: true, name: name.trim() || null, created_by: user.id })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Não foi possível criar o grupo.");
      return;
    }
    await supabase
      .from("conversation_members")
      .insert([user.id, ...picked].map((id) => ({ conversation_id: data.id, user_id: id })));
    setOpen(false);
    setName("");
    setPicked([]);
    onSelect({ kind: "dm", conversationId: data.id });
  };

  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex h-14 items-center border-b border-border px-4">
        <ClyroWordmark />
      </div>
      <div className="p-2">
        <button
          type="button"
          onClick={() => onSelect({ kind: "friends" })}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:bg-accent",
            selection.kind === "friends" && "bg-accent",
          )}
        >
          <Users size={16} /> Amigos
        </button>
      </div>
      <div className="flex items-center justify-between px-4 pb-1 pt-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mensagens diretas
        </span>
        <button
          type="button"
          aria-label="Nova conversa em grupo"
          onClick={() => setOpen(true)}
          className="text-muted-foreground transition hover:text-foreground"
        >
          <Plus size={14} />
        </button>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto clyro-scroll px-2 pb-2">
        {conversations.map((conversation) => {
          const others = conversation.member_ids.filter((id) => id !== user?.id);
          const single = !conversation.is_group && others[0] ? profiles?.get(others[0]) : undefined;
          const active =
            selection.kind === "dm" && selection.conversationId === conversation.id;
          return (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "dm", conversationId: conversation.id })}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent",
                  active && "bg-accent",
                )}
              >
                <UserAvatar profile={single} size={30} showStatus={!conversation.is_group} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {conversationTitle(conversation, profiles, user?.id)}
                </span>
              </button>
            </li>
          );
        })}
        {conversations.length === 0 && (
          <li className="px-2 py-3 text-xs text-muted-foreground">
            Nenhuma conversa ainda. Comece por Amigos.
          </li>
        )}
      </ul>
      {footer}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa em grupo</DialogTitle>
            <DialogDescription>Selecione amigos para conversar juntos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nome (opcional)</Label>
              <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <ul className="max-h-60 space-y-1 overflow-y-auto clyro-scroll">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setPicked((prev) =>
                        prev.includes(friend.id)
                          ? prev.filter((id) => id !== friend.id)
                          : [...prev, friend.id],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent",
                      picked.includes(friend.id) && "bg-accent",
                    )}
                  >
                    <UserAvatar profile={friend} size={28} showStatus={false} />
                    <span className="text-sm">{friend.display_name || friend.username}</span>
                  </button>
                </li>
              ))}
              {friends.length === 0 && (
                <li className="text-sm text-muted-foreground">Adicione amigos primeiro.</li>
              )}
            </ul>
            <Button className="w-full" onClick={() => void createGroup()} disabled={picked.length === 0}>
              Criar grupo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
