import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { resignLegacyUrl } from "@/lib/profile-media";

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: PresenceStatus;
  activity: string | null;
  created_at: string;
  /** Campos de personalização — opcionais até a migração 20260821200000 rodar. */
  bio?: string | null;
  pronouns?: string | null;
  banner_color?: string | null;
  banner_url?: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("profiles")
      // select("*") para o app não quebrar caso a migração de personalização
      // ainda não tenha rodado — os campos novos chegam quando existirem.
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) return;
    setProfile(data as Profile);
    void healLegacyMedia(data as Profile);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        setTimeout(() => void loadProfile(nextSession.user.id), 0);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) void loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`profile-self-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => setProfile(payload.new as Profile),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const signOut = useCallback(async () => {
    if (user) {
      await supabase.from("voice_states").delete().eq("user_id", user.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * O bucket de imagens passou a ser privado, e os links públicos gravados antes
 * disso não abrem mais. Ao carregar o próprio perfil eles são reassinados e
 * regravados: a foto volta sozinha, sem ninguém ter que reenviar nada.
 */
async function healLegacyMedia(profile: Profile) {
  const [avatarUrl, bannerUrl] = await Promise.all([
    resignLegacyUrl(profile.avatar_url),
    resignLegacyUrl(profile.banner_url),
  ]);
  if (!avatarUrl && !bannerUrl) return;

  const patch = {
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    ...(bannerUrl ? { banner_url: bannerUrl } : {}),
  };
  const { error } = await supabase
    .from("profiles")
    // banner_url pode não existir nos tipos gerados ainda (migração de mídia).
    .update(patch as { avatar_url?: string })
    .eq("id", profile.id);
  if (error) console.error("[clyro] não foi possível reassinar as imagens do perfil", error);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
