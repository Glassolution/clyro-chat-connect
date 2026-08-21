
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  status text NOT NULL DEFAULT 'online',
  activity text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)) || '_' || substr(NEW.id::text, 1, 4),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SERVERS
CREATE TABLE public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.servers TO authenticated;
GRANT ALL ON public.servers TO service_role;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.server_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.server_members TO authenticated;
GRANT ALL ON public.server_members TO service_role;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_server_member(_server_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id);
$$;

CREATE POLICY "servers_select" ON public.servers FOR SELECT TO authenticated USING (public.is_server_member(id, auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "servers_insert" ON public.servers FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "servers_update_owner" ON public.servers FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "servers_delete_owner" ON public.servers FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "server_members_select" ON public.server_members FOR SELECT TO authenticated USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "server_members_insert_self" ON public.server_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "server_members_delete_self" ON public.server_members FOR DELETE TO authenticated USING (user_id = auth.uid());

-- CHANNELS
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels_select" ON public.channels FOR SELECT TO authenticated USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "channels_insert" ON public.channels FOR INSERT TO authenticated WITH CHECK (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "channels_update" ON public.channels FOR UPDATE TO authenticated USING (public.is_server_member(server_id, auth.uid())) WITH CHECK (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "channels_delete" ON public.channels FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()));

-- CONVERSATIONS (DMs)
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group boolean NOT NULL DEFAULT false,
  name text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.conversation_members TO authenticated;
GRANT ALL ON public.conversation_members TO service_role;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = _conversation_id AND user_id = _user_id);
$$;

CREATE POLICY "conversations_select" ON public.conversations FOR SELECT TO authenticated USING (public.is_conversation_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE TO authenticated USING (public.is_conversation_member(id, auth.uid())) WITH CHECK (public.is_conversation_member(id, auth.uid()));

CREATE POLICY "conv_members_select" ON public.conversation_members FOR SELECT TO authenticated USING (public.is_conversation_member(conversation_id, auth.uid()));
CREATE POLICY "conv_members_insert" ON public.conversation_members FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
  OR public.is_conversation_member(conversation_id, auth.uid())
);
CREATE POLICY "conv_members_delete_self" ON public.conversation_members FOR DELETE TO authenticated USING (user_id = auth.uid());

-- MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_channel_idx ON public.messages (channel_id, created_at);
CREATE INDEX messages_conversation_idx ON public.messages (conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated USING (
  (channel_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND public.is_server_member(c.server_id, auth.uid())))
  OR (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
);
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid() AND (
    (channel_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND public.is_server_member(c.server_id, auth.uid())))
    OR (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
  )
);
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated USING (author_id = auth.uid());

-- FRIENDSHIPS
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friendships_select" ON public.friendships FOR SELECT TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());
CREATE POLICY "friendships_insert" ON public.friendships FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid() AND addressee_id <> auth.uid());
CREATE POLICY "friendships_update" ON public.friendships FOR UPDATE TO authenticated USING (addressee_id = auth.uid() OR requester_id = auth.uid()) WITH CHECK (addressee_id = auth.uid() OR requester_id = auth.uid());
CREATE POLICY "friendships_delete" ON public.friendships FOR DELETE TO authenticated USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- VOICE STATES
CREATE TABLE public.voice_states (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  muted boolean NOT NULL DEFAULT false,
  deafened boolean NOT NULL DEFAULT false,
  sharing_screen boolean NOT NULL DEFAULT false,
  camera_on boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_states TO authenticated;
GRANT ALL ON public.voice_states TO service_role;
ALTER TABLE public.voice_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_states_select" ON public.voice_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "voice_states_write_own" ON public.voice_states FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- REALTIME
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.voice_states REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.channels REPLICA IDENTITY FULL;
ALTER TABLE public.server_members REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_states;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
