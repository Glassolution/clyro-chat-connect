-- SALAS COM ACESSO
-- Qualquer pessoa do workspace abre uma sala (um canal de voz com chat). Todo o
-- time vê todas as salas; a sala pode ser aberta (entra quem quiser) ou com
-- pedido (quem não tem acesso pede, e quem criou a sala ou um admin aprova).
--
-- Fica em tabelas separadas de `channels` de propósito: sem esta migração o app
-- continua funcionando, só que toda sala conta como aberta.

-- Ajustes de cada sala. Sala sem linha aqui = aberta, sem dono conhecido.
CREATE TABLE IF NOT EXISTS public.room_settings (
  channel_id uuid PRIMARY KEY REFERENCES public.channels(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked boolean NOT NULL DEFAULT false,
  topic text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_settings_topic_length CHECK (topic IS NULL OR length(topic) <= 280)
);

CREATE INDEX IF NOT EXISTS room_settings_server_idx ON public.room_settings (server_id);

-- Pedidos e acessos: uma linha por pessoa por sala.
CREATE TABLE IF NOT EXISTS public.room_access (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id),
  CONSTRAINT room_access_status CHECK (status IN ('pending', 'approved', 'denied'))
);

CREATE INDEX IF NOT EXISTS room_access_server_idx ON public.room_access (server_id);

-- O canal tem que ser do workspace informado, senão dá para cruzar dados.
CREATE OR REPLACE FUNCTION public.channel_in_server(_channel_id uuid, _server_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c WHERE c.id = _channel_id AND c.server_id = _server_id
  );
$$;

-- Quem decide sobre a sala: quem criou e os admins do workspace.
CREATE OR REPLACE FUNCTION public.can_manage_room(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_settings r
    WHERE r.channel_id = _channel_id AND r.created_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = _channel_id AND public.is_workspace_admin(c.server_id, _user_id)
  );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_access TO authenticated;
GRANT ALL ON public.room_settings TO service_role;
GRANT ALL ON public.room_access TO service_role;
ALTER TABLE public.room_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_access ENABLE ROW LEVEL SECURITY;

-- room_settings ------------------------------------------------------------

DROP POLICY IF EXISTS "room_settings_select" ON public.room_settings;
CREATE POLICY "room_settings_select" ON public.room_settings
  FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

-- Quem acabou de criar a sala grava os ajustes dela; um admin pode criar os
-- ajustes de uma sala antiga. Ninguém "adota" a sala recente de outra pessoa
-- porque a chave primária só aceita a primeira linha.
DROP POLICY IF EXISTS "room_settings_insert" ON public.room_settings;
CREATE POLICY "room_settings_insert" ON public.room_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_server_member(server_id, auth.uid())
    AND public.channel_in_server(channel_id, server_id)
    AND (
      public.is_workspace_admin(server_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.channels c
        WHERE c.id = channel_id AND c.created_at > now() - interval '10 minutes'
      )
    )
  );

DROP POLICY IF EXISTS "room_settings_update" ON public.room_settings;
CREATE POLICY "room_settings_update" ON public.room_settings
  FOR UPDATE TO authenticated
  USING (public.can_manage_room(channel_id, auth.uid()))
  WITH CHECK (
    public.can_manage_room(channel_id, auth.uid())
    AND public.channel_in_server(channel_id, server_id)
  );

DROP POLICY IF EXISTS "room_settings_delete" ON public.room_settings;
CREATE POLICY "room_settings_delete" ON public.room_settings
  FOR DELETE TO authenticated
  USING (public.can_manage_room(channel_id, auth.uid()));

-- room_access --------------------------------------------------------------

-- O time inteiro vê quem pediu e quem tem acesso, como numa lista de presença.
DROP POLICY IF EXISTS "room_access_select" ON public.room_access;
CREATE POLICY "room_access_select" ON public.room_access
  FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

-- Você pede para você mesmo; quem cuida da sala pode já liberar alguém.
DROP POLICY IF EXISTS "room_access_insert" ON public.room_access;
CREATE POLICY "room_access_insert" ON public.room_access
  FOR INSERT TO authenticated
  WITH CHECK (
    public.channel_in_server(channel_id, server_id)
    AND public.is_server_member(server_id, user_id)
    AND (
      (user_id = auth.uid() AND status = 'pending')
      OR public.can_manage_room(channel_id, auth.uid())
    )
  );

-- Quem cuida da sala aprova ou recusa; quem foi recusado pode pedir de novo.
DROP POLICY IF EXISTS "room_access_update_manager" ON public.room_access;
CREATE POLICY "room_access_update_manager" ON public.room_access
  FOR UPDATE TO authenticated
  USING (public.can_manage_room(channel_id, auth.uid()))
  WITH CHECK (public.can_manage_room(channel_id, auth.uid()));

DROP POLICY IF EXISTS "room_access_update_self" ON public.room_access;
CREATE POLICY "room_access_update_self" ON public.room_access
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "room_access_delete" ON public.room_access;
CREATE POLICY "room_access_delete" ON public.room_access
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_room(channel_id, auth.uid()));

-- channels ---------------------------------------------------------------

-- Sala vazia por 2 minutos some: o app de quem criou (ou de um admin) apaga o
-- canal. Antes só o dono do workspace podia apagar canais; esta política soma
-- quem criou a sala e os admins, só para salas criadas pela aba Salas.
DROP POLICY IF EXISTS "channels_delete_room" ON public.channels;
CREATE POLICY "channels_delete_room" ON public.channels
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.room_settings r WHERE r.channel_id = channels.id)
    AND public.can_manage_room(channels.id, auth.uid())
  );

-- Tempo real: pedidos aparecem para quem aprova e a resposta volta na hora.
ALTER TABLE public.room_settings REPLICA IDENTITY FULL;
ALTER TABLE public.room_access REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_access;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;