import { useState } from "react";
import { Plus, Compass, Hash } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ClyroMark } from "./primitives";
import { initialsOf, type Server } from "@/lib/clyro-types";

export function ServerRail({
  servers,
  activeServerId,
  onHome,
  onSelectServer,
  onChanged,
  userId,
}: {
  servers: Server[];
  activeServerId: string | null;
  onHome: () => void;
  onSelectServer: (id: string) => void;
  onChanged: () => void;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const createServer = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("servers")
      .insert({ name: name.trim(), owner_id: userId })
      .select("id")
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error("Não foi possível criar o servidor.");
      return;
    }
    await supabase.from("server_members").insert({ server_id: data.id, user_id: userId, role: "owner" });
    await supabase.from("channels").insert([
      { server_id: data.id, name: "geral", kind: "text", position: 0 },
      { server_id: data.id, name: "avisos", kind: "text", position: 1 },
      { server_id: data.id, name: "Sala de voz", kind: "voice", position: 2 },
    ]);
    setBusy(false);
    setName("");
    setOpen(false);
    onChanged();
    onSelectServer(data.id);
    toast.success("Servidor criado.");
  };

  const joinServer = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const { data } = await supabase
      .from("servers")
      .select("id")
      .eq("invite_code", code.trim().toLowerCase())
      .maybeSingle();
    if (!data) {
      setBusy(false);
      toast.error("Convite inválido.");
      return;
    }
    const { error } = await supabase
      .from("server_members")
      .insert({ server_id: data.id, user_id: userId });
    setBusy(false);
    if (error && !error.message.includes("duplicate")) {
      toast.error("Não foi possível entrar.");
      return;
    }
    setCode("");
    setOpen(false);
    onChanged();
    onSelectServer(data.id);
    toast.success("Você entrou no servidor.");
  };

  return (
    <nav className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3 text-rail-foreground">
      <RailButton active={activeServerId === null} onClick={onHome} label="Mensagens diretas">
        <ClyroMark className="h-7 w-7" />
      </RailButton>
      <span className="my-1 h-px w-8 bg-rail-foreground/15" />
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto clyro-scroll">
        {servers.map((server) => (
          <RailButton
            key={server.id}
            active={activeServerId === server.id}
            onClick={() => onSelectServer(server.id)}
            label={server.name}
          >
            {server.icon_url ? (
              <img src={server.icon_url} alt="" className="h-full w-full rounded-[inherit] object-cover" />
            ) : (
              <span className="text-sm font-semibold">{initialsOf(server.name) || <Hash size={16} />}</span>
            )}
          </RailButton>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-rail-foreground/25 text-rail-foreground/70 transition hover:border-rail-foreground/60 hover:text-rail-foreground"
                aria-label="Adicionar servidor"
              >
                <Plus size={18} />
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Adicionar servidor</TooltipContent>
        </Tooltip>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Servidores</DialogTitle>
            <DialogDescription>Crie um espaço novo ou entre com um código de convite.</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="create">
            <TabsList className="w-full">
              <TabsTrigger value="create" className="flex-1">
                Criar
              </TabsTrigger>
              <TabsTrigger value="join" className="flex-1">
                Entrar
              </TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="space-y-3 pt-4">
              <Label htmlFor="server-name">Nome do servidor</Label>
              <Input
                id="server-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Time de design"
              />
              <Button className="w-full" onClick={() => void createServer()} disabled={busy}>
                Criar servidor
              </Button>
            </TabsContent>
            <TabsContent value="join" className="space-y-3 pt-4">
              <Label htmlFor="invite">Código de convite</Label>
              <Input
                id="invite"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="a1b2c3d4"
              />
              <Button className="w-full" onClick={() => void joinServer()} disabled={busy}>
                <Compass size={16} /> Entrar no servidor
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </nav>
  );
}

function RailButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-rail-foreground/10 text-rail-foreground transition-all hover:rounded-xl hover:bg-rail-foreground/20",
            active && "rounded-xl bg-rail-foreground text-rail",
          )}
        >
          {active && (
            <span className="absolute -left-3 h-6 w-1.5 rounded-r-full bg-rail-foreground" aria-hidden />
          )}
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
