-- WORKSPACES, EQUIPES E CONVITES
-- O Clyro deixa de ser só comunidade e vira ferramenta de founder. O "servidor"
-- de antes passa a ser o workspace da startup: a tabela continua a mesma (chat,
-- salas de voz e membros seguem funcionando), e ao lado dela entram as equipes e
-- os convites por email ou por usuário.

-- ---------------------------------------------------------------------------
-- Papel no workspace: owner > admin > member. O dono continua sendo o
-- servers.owner_id; o papel na tabela de membros cobre os admins.
CREATE OR REPLACE FUNCTION public.is_workspace_admin(_server_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.servers s WHERE s.id = _server_id AND s.owner_id = _user_id)
      OR EXISTS (
        SELECT 1 FROM public.server_members m
        WHERE m.server_id = _server_id AND m.user_id = _user_id AND m.role IN ('owner', 'admin')
      );
$$;

-- ---------------------------------------------------------------------------
-- EQUIPES
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT 'blue',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 48)
);
CREATE INDEX IF NOT EXISTS teams_server_idx ON public.teams (server_id);

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id),
  CONSTRAINT team_members_role CHECK (role IN ('lead', 'member'))
);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON public.team_members (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.teams TO service_role;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Todo mundo do workspace vê as equipes; quem é admin cria e mexe.
DROP POLICY IF EXISTS "teams_select" ON public.teams;
CREATE POLICY "teams_select" ON public.teams FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));
DROP POLICY IF EXISTS "teams_insert" ON public.teams;
CREATE POLICY "teams_insert" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_workspace_admin(server_id, auth.uid()));
DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update" ON public.teams FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(server_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(server_id, auth.uid()));
DROP POLICY IF EXISTS "teams_delete" ON public.teams;
CREATE POLICY "teams_delete" ON public.teams FOR DELETE TO authenticated
  USING (public.is_workspace_admin(server_id, auth.uid()));

-- Membro de equipe precisa já ser do workspace; admin coloca e tira, e cada um
-- pode sair da própria equipe.
DROP POLICY IF EXISTS "team_members_select" ON public.team_members;
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = team_id AND public.is_server_member(t.server_id, auth.uid())
  ));
DROP POLICY IF EXISTS "team_members_insert" ON public.team_members;
CREATE POLICY "team_members_insert" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = team_id
      AND public.is_workspace_admin(t.server_id, auth.uid())
      AND public.is_server_member(t.server_id, user_id)
  ));
DROP POLICY IF EXISTS "team_members_update" ON public.team_members;
CREATE POLICY "team_members_update" ON public.team_members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = team_id AND public.is_workspace_admin(t.server_id, auth.uid())
  ));
DROP POLICY IF EXISTS "team_members_delete" ON public.team_members;
CREATE POLICY "team_members_delete" ON public.team_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.teams t WHERE t.id = team_id AND public.is_workspace_admin(t.server_id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- CONVITES
-- Um convite aponta para um usuário (quando foi feito por @usuário ou o email já
-- tem conta) ou só para um email (pessoa que ainda vai criar a conta). Quem
-- entra com aquele email vê o convite esperando no Clyro.
CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT workspace_invites_target CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT workspace_invites_status CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  CONSTRAINT workspace_invites_role CHECK (role IN ('admin', 'member'))
);
CREATE INDEX IF NOT EXISTS workspace_invites_server_idx ON public.workspace_invites (server_id, status);
CREATE INDEX IF NOT EXISTS workspace_invites_user_idx ON public.workspace_invites (user_id, status);
CREATE INDEX IF NOT EXISTS workspace_invites_email_idx ON public.workspace_invites (lower(email), status);
-- Um convite pendente por pessoa por workspace.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_pending_user
  ON public.workspace_invites (server_id, user_id) WHERE status = 'pending' AND user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_pending_email
  ON public.workspace_invites (server_id, lower(email)) WHERE status = 'pending' AND user_id IS NULL;

GRANT SELECT, UPDATE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Quem é do workspace vê os convites dele; o convidado vê os seus. Criar e
-- aceitar passam pelas funções abaixo, que fazem as checagens.
DROP POLICY IF EXISTS "workspace_invites_select" ON public.workspace_invites;
CREATE POLICY "workspace_invites_select" ON public.workspace_invites FOR SELECT TO authenticated
  USING (
    public.is_server_member(server_id, auth.uid())
    OR user_id = auth.uid()
    OR (email IS NOT NULL AND lower(email) = lower(auth.jwt() ->> 'email'))
  );
-- Admin revoga convite pendente.
DROP POLICY IF EXISTS "workspace_invites_update" ON public.workspace_invites;
CREATE POLICY "workspace_invites_update" ON public.workspace_invites FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(server_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(server_id, auth.uid()));

/**
 * Convida alguém por @usuário ou email. Devolve o convite criado (ou o pendente
 * que já existia). Erros saem com mensagens prontas para mostrar na tela.
 */
CREATE OR REPLACE FUNCTION public.invite_to_workspace(
  _server_id uuid,
  _identifier text,
  _team_id uuid DEFAULT NULL,
  _role text DEFAULT 'member'
)
RETURNS public.workspace_invites
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _target text := btrim(_identifier);
  _user uuid;
  _email text;
  _row public.workspace_invites;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para convidar.'; END IF;
  IF NOT public.is_workspace_admin(_server_id, _me) THEN
    RAISE EXCEPTION 'Só quem administra o workspace pode convidar.';
  END IF;
  IF _target = '' THEN RAISE EXCEPTION 'Informe um email ou @usuário.'; END IF;
  IF _role NOT IN ('admin', 'member') THEN _role := 'member'; END IF;
  IF _team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams WHERE id = _team_id AND server_id = _server_id
  ) THEN
    RAISE EXCEPTION 'Essa equipe não é deste workspace.';
  END IF;

  IF position('@' IN _target) > 1 THEN
    -- Email: se já tem conta, o convite vai direto para a pessoa.
    _email := lower(_target);
    SELECT id INTO _user FROM auth.users WHERE lower(email) = _email LIMIT 1;
  ELSE
    SELECT id INTO _user FROM public.profiles
      WHERE lower(username) = lower(ltrim(_target, '@')) LIMIT 1;
    IF _user IS NULL THEN RAISE EXCEPTION 'Nenhum usuário com esse nome.'; END IF;
  END IF;

  IF _user = _me THEN RAISE EXCEPTION 'Você já está neste workspace.'; END IF;

  IF _user IS NOT NULL AND public.is_server_member(_server_id, _user) THEN
    -- Já é do workspace: só falta colocar na equipe. Devolve um convite vazio
    -- (id nulo) para a tela saber que não houve convite novo.
    IF _team_id IS NOT NULL THEN
      INSERT INTO public.team_members (team_id, user_id) VALUES (_team_id, _user)
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END IF;
    _row.user_id := _user;
    _row.team_id := _team_id;
    RETURN _row;
  END IF;

  SELECT * INTO _row FROM public.workspace_invites
    WHERE server_id = _server_id AND status = 'pending'
      AND ((_user IS NOT NULL AND user_id = _user) OR (_user IS NULL AND lower(email) = _email))
    LIMIT 1;
  IF FOUND THEN RETURN _row; END IF;

  INSERT INTO public.workspace_invites (server_id, team_id, invited_by, user_id, email, role)
  VALUES (_server_id, _team_id, _me, _user, _email, _role)
  RETURNING * INTO _row;
  RETURN _row;
END; $$;

/** Aceita ou recusa um convite endereçado a quem chama. */
CREATE OR REPLACE FUNCTION public.respond_to_invite(_invite_id uuid, _accept boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _my_email text := lower(auth.jwt() ->> 'email');
  _inv public.workspace_invites;
BEGIN
  SELECT * INTO _inv FROM public.workspace_invites WHERE id = _invite_id FOR UPDATE;
  IF NOT FOUND OR _inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Esse convite não está mais disponível.';
  END IF;
  IF NOT (_inv.user_id = _me OR (_inv.user_id IS NULL AND lower(_inv.email) = _my_email)) THEN
    RAISE EXCEPTION 'Esse convite é para outra pessoa.';
  END IF;

  UPDATE public.workspace_invites
    SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
        user_id = _me,
        responded_at = now()
    WHERE id = _invite_id;

  IF _accept THEN
    INSERT INTO public.server_members (server_id, user_id, role)
    VALUES (_inv.server_id, _me, _inv.role)
    ON CONFLICT (server_id, user_id) DO NOTHING;
    IF _inv.team_id IS NOT NULL THEN
      INSERT INTO public.team_members (team_id, user_id) VALUES (_inv.team_id, _me)
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN _inv.server_id;
END; $$;

/** Admin muda o papel de alguém no workspace (o dono não muda). */
CREATE OR REPLACE FUNCTION public.set_workspace_role(_server_id uuid, _user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_admin(_server_id, auth.uid()) THEN
    RAISE EXCEPTION 'Só quem administra o workspace pode mudar papéis.';
  END IF;
  IF _role NOT IN ('admin', 'member') THEN RAISE EXCEPTION 'Papel inválido.'; END IF;
  IF EXISTS (SELECT 1 FROM public.servers WHERE id = _server_id AND owner_id = _user_id) THEN
    RAISE EXCEPTION 'O papel do dono não muda.';
  END IF;
  UPDATE public.server_members SET role = _role WHERE server_id = _server_id AND user_id = _user_id;
END; $$;

/** Admin tira alguém do workspace (e de todas as equipes dele). */
CREATE OR REPLACE FUNCTION public.remove_from_workspace(_server_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_workspace_admin(_server_id, auth.uid()) THEN
    RAISE EXCEPTION 'Só quem administra o workspace pode remover pessoas.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.servers WHERE id = _server_id AND owner_id = _user_id) THEN
    RAISE EXCEPTION 'O dono não pode ser removido.';
  END IF;
  DELETE FROM public.team_members tm USING public.teams t
    WHERE tm.team_id = t.id AND t.server_id = _server_id AND tm.user_id = _user_id;
  DELETE FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id;
END; $$;

REVOKE ALL ON FUNCTION public.invite_to_workspace(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_invite(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_workspace_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_from_workspace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_workspace(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_invite(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_from_workspace(uuid, uuid) TO authenticated;

-- O dono de cada workspace que já existe vira "owner" na lista de membros.
UPDATE public.server_members m SET role = 'owner'
  FROM public.servers s
  WHERE s.id = m.server_id AND s.owner_id = m.user_id AND m.role <> 'owner';

-- Tempo real para equipes e convites.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.teams; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_invites; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;