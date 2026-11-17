import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CloseCircle, Link21 } from "iconsax-react";
import { AtSign } from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { inviteLink } from "@/lib/invite-link";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/lib/clyro-queries";
import type { Profile, Server } from "@/lib/clyro-types";
import { Mascot } from "@/components/workspace/mascot";
import { UserAvatar } from "./primitives";

/** Onde cada rosto fica em volta do mascote, em % do quadro da ilustração. */
const SPOTS = [
  { left: "14%", top: "18%", size: 40 },
  { left: "76%", top: "10%", size: 34 },
  { left: "84%", top: "56%", size: 42 },
  { left: "6%", top: "62%", size: 32 },
  { left: "62%", top: "78%", size: 28 },
];

/**
 * "Encontre e convide pessoas que você conhece": compartilhar o convite do
 * workspace, ou pedir amizade pelo @ de quem já tem conta.
 */
export function InvitePeopleDialog({
  open,
  onOpenChange,
  workspace,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Server | null;
}) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const [adding, setAdding] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  // Rostos de verdade na ilustração: quem tem foto primeiro.
  const faces = useMemo(() => {
    const all = [...(profiles?.values() ?? [])].filter((p) => p.id !== user?.id);
    all.sort((a, b) => Number(!!b.avatar_url) - Number(!!a.avatar_url));
    return all.slice(0, SPOTS.length);
  }, [profiles, user?.id]);

  const share = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text = workspace
      ? `Entre no ${workspace.name} no Clyro: ${inviteLink(workspace.invite_code)}`
      : `Vem conversar comigo no Clyro: ${origin}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Convite para o Clyro", text });
        return;
      }
    } catch (error) {
      // Fechar a folha de compartilhar não é erro; outra falha cai na cópia.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Convite copiado. É só colar onde vocês conversam.");
    } catch {
      toast.error("Não foi possível copiar o convite.");
    }
  };

  const addFriend = async () => {
    const term = handle.trim().replace(/^@/, "").toLowerCase();
    if (!term || !user) return;
    setBusy(true);
    const { data: matches } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .or(`username.eq.${term},username.ilike.${term}%,display_name.ilike.${term}`)
      .limit(5);
    const found =
      matches?.find((p) => p.username.toLowerCase() === term) ??
      matches?.find((p) => (p.display_name ?? "").toLowerCase() === term) ??
      matches?.[0];
    if (!found) {
      setBusy(false);
      toast.error("Ninguém com esse @ por aqui.");
      return;
    }
    if (found.id === user.id) {
      setBusy(false);
      toast.error("Esse é você.");
      return;
    }
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: found.id });
    setBusy(false);
    if (error) {
      toast.error("Esse pedido já existe ou não pôde ser enviado.");
      return;
    }
    setHandle("");
    toast.success(`Pedido enviado para @${found.username}.`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setAdding(false);
          setHandle("");
        }
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-[400px] gap-0 rounded-[24px] p-6">
        <button
          type="button"
          aria-label="Fechar"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 flex text-[#a3a3a3] transition-colors hover:text-foreground"
        >
          <CloseCircle size={22} color="currentColor" variant="Bold" />
        </button>

        <Illustration faces={faces} />

        <DialogTitle className="mx-auto mt-5 max-w-[17rem] text-balance text-center text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]">
          Encontre e convide pessoas que você conhece
        </DialogTitle>
        <DialogDescription className="mx-auto mt-2 max-w-[19rem] text-pretty text-center text-[13.5px] leading-[1.5] text-muted-foreground">
          {workspace
            ? `Mande o convite do ${workspace.name} para quem trabalha com você, ou peça amizade pelo @ de quem já está no Clyro.`
            : "Mande o convite para quem trabalha com você, ou peça amizade pelo @ de quem já está no Clyro."}
        </DialogDescription>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void share()}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-[14px] font-medium text-background outline-none transition-[opacity,transform] duration-200 ease-clyro hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Link21 size={17} color="currentColor" />
            Compartilhar convite
          </button>

          {adding ? (
            <form
              className="clyro-fade-in flex h-11 items-center gap-1 rounded-full border border-black/[0.1] pl-4 pr-1 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15"
              onSubmit={(e) => {
                e.preventDefault();
                void addFriend();
              }}
            >
              <AtSign size={16} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="usuario"
                aria-label="Nome de usuário"
                className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!handle.trim() || busy}
                className="h-9 shrink-0 rounded-full bg-brand-soft px-4 text-[13.5px] font-medium text-[#9a3a00] transition-[opacity,transform] active:scale-95 disabled:opacity-50"
              >
                {busy ? "Enviando…" : "Pedir amizade"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-11 items-center justify-center gap-2 rounded-full border border-black/[0.1] text-[14px] font-medium outline-none transition-[background-color,transform] duration-200 ease-clyro hover:bg-[#f5f5f5] focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]"
            >
              <AtSign size={17} />
              Adicionar pelo @usuário
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Illustration({ faces }: { faces: Profile[] }) {
  return (
    <div aria-hidden className="relative mx-auto mt-2 h-[132px] w-[220px]">
      {/* anéis claros por trás, como ondas saindo do centro */}
      <span className="absolute left-1/2 top-1/2 h-[128px] w-[128px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-black/[0.08]" />
      <span className="absolute left-1/2 top-1/2 h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-soft" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Mascot pose="energia" size={64} />
      </span>
      {SPOTS.map((spot, i) => {
        const face = faces[i];
        return (
          <span
            key={i}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-card",
              "shadow-[0_4px_12px_-4px_rgb(0_0_0/0.18)]",
            )}
            style={{ left: spot.left, top: spot.top }}
          >
            {face ? (
              <UserAvatar profile={face} size={spot.size} showStatus={false} />
            ) : (
              <span
                className="flex items-center justify-center rounded-full bg-[#f4f4f5]"
                style={{ width: spot.size, height: spot.size }}
              >
                <Mascot pose={i % 2 ? "sorte" : "estrela"} size={spot.size * 0.8} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
