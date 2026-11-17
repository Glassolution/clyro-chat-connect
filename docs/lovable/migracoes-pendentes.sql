-- MIGRAÇÕES PENDENTES DO CLYRO — rodar uma vez, nesta ordem, no banco do Lovable.
-- Junta as 5 migrações de supabase/migrations que ainda não rodaram no banco:
--   20261114150000_workspace_teams_invites.sql
--   20261114170000_projects_access_requests.sql
--   20261116120000_tasks_meetings.sql
--   20261116150000_room_access.sql
--   20261116180000_owner_requests_invite_links.sql
-- Todas usam IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS, então rodar de novo não quebra.


-- ============================================================================
-- 20261114150000_workspace_teams_invites.sql
-- ============================================================================
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


-- ============================================================================
-- 20261114170000_projects_access_requests.sql
-- ============================================================================
-- PROJETOS E PEDIDOS DE ACESSO
-- O Clyro vira vitrine de startups e comunidades. Cada workspace (a tabela
-- `servers`) passa a ser um projeto publicado: tem capa, categoria, o que está
-- procurando e um formulário de entrada. Quem quer participar pede acesso; o
-- dono vê o perfil e as respostas e aprova ou recusa. Uma pessoa pode estar em
-- quantos projetos quiser.
--
-- Depende de 20261114150000_workspace_teams_invites (is_workspace_admin).

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS looking_for text[] NOT NULL DEFAULT '{}',
  -- Perguntas do formulário: [{ "id": "q1", "label": "...", "required": true }]
  ADD COLUMN IF NOT EXISTS access_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS servers_category_idx ON public.servers (category) WHERE is_public;

-- ---------------------------------------------------------------------------
-- Entrar num projeto agora só por aprovação, convite ou código. Antes qualquer
-- pessoa conseguia se inserir como membro de qualquer servidor direto pela API.
DROP POLICY IF EXISTS "server_members_insert_self" ON public.server_members;
DROP POLICY IF EXISTS "server_members_insert_owner" ON public.server_members;
CREATE POLICY "server_members_insert_owner" ON public.server_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- { "<id da pergunta>": "resposta" }
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT access_requests_message_length CHECK (message IS NULL OR length(message) <= 1000)
);
CREATE INDEX IF NOT EXISTS access_requests_server_idx ON public.access_requests (server_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS access_requests_user_idx ON public.access_requests (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
  ON public.access_requests (server_id, user_id) WHERE status = 'pending';

GRANT SELECT ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Cada um vê os próprios pedidos; quem administra o projeto vê os dele.
DROP POLICY IF EXISTS "access_requests_select" ON public.access_requests;
CREATE POLICY "access_requests_select" ON public.access_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()));

/** Pede para entrar num projeto, com as respostas do formulário. */
CREATE OR REPLACE FUNCTION public.request_access(
  _server_id uuid,
  _answers jsonb DEFAULT '{}'::jsonb,
  _message text DEFAULT NULL
)
RETURNS public.access_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _server public.servers;
  _row public.access_requests;
  _q jsonb;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para pedir acesso.'; END IF;
  SELECT * INTO _server FROM public.servers WHERE id = _server_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esse projeto não existe mais.'; END IF;
  IF public.is_server_member(_server_id, _me) THEN
    RAISE EXCEPTION 'Você já faz parte deste projeto.';
  END IF;

  -- Perguntas obrigatórias precisam de resposta.
  FOR _q IN SELECT * FROM jsonb_array_elements(_server.access_questions) LOOP
    IF coalesce((_q ->> 'required')::boolean, false)
       AND btrim(coalesce(_answers ->> (_q ->> 'id'), '')) = '' THEN
      RAISE EXCEPTION 'Responda: %', _q ->> 'label';
    END IF;
  END LOOP;

  SELECT * INTO _row FROM public.access_requests
    WHERE server_id = _server_id AND user_id = _me AND status = 'pending';
  IF FOUND THEN
    UPDATE public.access_requests
      SET answers = coalesce(_answers, '{}'::jsonb), message = nullif(btrim(_message), '')
      WHERE id = _row.id
      RETURNING * INTO _row;
    RETURN _row;
  END IF;

  INSERT INTO public.access_requests (server_id, user_id, answers, message)
  VALUES (_server_id, _me, coalesce(_answers, '{}'::jsonb), nullif(btrim(_message), ''))
  RETURNING * INTO _row;
  RETURN _row;
END; $$;

/** Desiste de um pedido ainda pendente. */
CREATE OR REPLACE FUNCTION public.cancel_access_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.access_requests SET status = 'cancelled'
    WHERE id = _request_id AND user_id = auth.uid() AND status = 'pending';
END; $$;

/** Dono ou admin aprova (a pessoa entra no projeto) ou recusa. */
CREATE OR REPLACE FUNCTION public.review_access_request(_request_id uuid, _approve boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _req public.access_requests;
BEGIN
  SELECT * INTO _req FROM public.access_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esse pedido já foi respondido.';
  END IF;
  IF NOT public.is_workspace_admin(_req.server_id, auth.uid()) THEN
    RAISE EXCEPTION 'Só quem administra o projeto pode responder pedidos.';
  END IF;

  UPDATE public.access_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id;

  IF _approve THEN
    INSERT INTO public.server_members (server_id, user_id, role)
    VALUES (_req.server_id, _req.user_id, 'member')
    ON CONFLICT (server_id, user_id) DO NOTHING;
  END IF;
  RETURN _req.server_id;
END; $$;

-- ---------------------------------------------------------------------------
-- VITRINE
-- Projetos públicos, com o que a vitrine precisa. Funciona sem login (anon),
-- para a home mostrar projetos de verdade a quem ainda não tem conta.
CREATE OR REPLACE FUNCTION public.discover_projects(
  _search text DEFAULT NULL,
  _category text DEFAULT NULL,
  _limit int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  name text,
  tagline text,
  description text,
  icon_url text,
  cover_url text,
  category text,
  stage text,
  looking_for text[],
  member_count bigint,
  is_member boolean,
  request_status text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.id, s.name, s.tagline, s.description, s.icon_url, s.cover_url, s.category, s.stage,
    s.looking_for,
    (SELECT count(*) FROM public.server_members m WHERE m.server_id = s.id) AS member_count,
    coalesce(auth.uid() IS NOT NULL AND public.is_server_member(s.id, auth.uid()), false) AS is_member,
    (SELECT r.status FROM public.access_requests r
       WHERE r.server_id = s.id AND r.user_id = auth.uid()
       ORDER BY r.created_at DESC LIMIT 1) AS request_status,
    s.created_at
  FROM public.servers s
  WHERE s.is_public
    AND (_category IS NULL OR btrim(_category) = '' OR s.category = _category)
    AND (
      _search IS NULL OR btrim(_search) = ''
      OR s.name ILIKE '%' || btrim(_search) || '%'
      OR coalesce(s.tagline, '') ILIKE '%' || btrim(_search) || '%'
      OR coalesce(s.description, '') ILIKE '%' || btrim(_search) || '%'
      OR EXISTS (SELECT 1 FROM unnest(s.looking_for) l WHERE l ILIKE '%' || btrim(_search) || '%')
    )
  ORDER BY s.created_at DESC
  LIMIT least(greatest(coalesce(_limit, 60), 1), 120);
$$;

/**
 * Um projeto pelo link — inclusive privado, que não aparece na vitrine mas pode
 * ser compartilhado. Devolve as perguntas do formulário de entrada.
 */
CREATE OR REPLACE FUNCTION public.get_project(_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  tagline text,
  description text,
  icon_url text,
  cover_url text,
  category text,
  stage text,
  website text,
  looking_for text[],
  access_questions jsonb,
  is_public boolean,
  owner_id uuid,
  owner_name text,
  owner_avatar text,
  member_count bigint,
  is_member boolean,
  request_status text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    s.id, s.name, s.tagline, s.description, s.icon_url, s.cover_url, s.category, s.stage,
    s.website, s.looking_for, s.access_questions, s.is_public, s.owner_id,
    coalesce(nullif(p.display_name, ''), p.username) AS owner_name,
    p.avatar_url AS owner_avatar,
    (SELECT count(*) FROM public.server_members m WHERE m.server_id = s.id) AS member_count,
    coalesce(auth.uid() IS NOT NULL AND public.is_server_member(s.id, auth.uid()), false) AS is_member,
    (SELECT r.status FROM public.access_requests r
       WHERE r.server_id = s.id AND r.user_id = auth.uid()
       ORDER BY r.created_at DESC LIMIT 1) AS request_status,
    s.created_at
  FROM public.servers s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  WHERE s.id = _id;
$$;

REVOKE ALL ON FUNCTION public.request_access(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_access_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_access_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_access(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_access_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_access_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.discover_projects(text, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project(uuid) TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.access_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;


-- ============================================================================
-- 20261116120000_tasks_meetings.sql
-- ============================================================================
-- Tasks e reuniões agendadas do workspace: o que o painel mostra como "para
-- fazer", "delegadas" e "agenda". Quem é do workspace vê tudo; quem criou, a
-- pessoa responsável e os admins mexem.

-- ---------------------------------------------------------------------------
-- TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'todo',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT tasks_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT tasks_status CHECK (status IN ('todo', 'doing', 'done'))
);
CREATE INDEX IF NOT EXISTS tasks_server_idx ON public.tasks (server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks (assignee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

-- Cria quem é do workspace, e só pode delegar para quem também é.
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_server_member(server_id, auth.uid())
    AND (assignee_id IS NULL OR public.is_server_member(server_id, assignee_id))
  );

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_workspace_admin(server_id, auth.uid())
  )
  WITH CHECK (
    public.is_server_member(server_id, auth.uid())
    AND (assignee_id IS NULL OR public.is_server_member(server_id, assignee_id))
  );

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- REUNIÕES AGENDADAS
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetings_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT meetings_duration CHECK (duration_min BETWEEN 5 AND 480)
);
CREATE INDEX IF NOT EXISTS meetings_server_idx ON public.meetings (server_id, starts_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()))
  WITH CHECK (public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()));

-- O painel atualiza sozinho quando alguém cria ou conclui algo.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;


-- ============================================================================
-- 20261116150000_room_access.sql
-- ============================================================================
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


-- ============================================================================
-- 20261116180000_owner_requests_invite_links.sql
-- ============================================================================
-- PEDIDOS SÓ PARA O DONO E LINK DE CONVITE
-- Duas regras novas:
--   1. Quem pede para entrar numa startup é respondido só pelo dono do
--      workspace. Admin continua convidando e organizando equipes, mas não
--      aprova nem vê os pedidos.
--   2. O link de convite (/convite/<código>) é o aceite: quem abre entra na
--      hora. Se a pessoa tinha um pedido pendente, ele fica como aprovado.
--
-- Depende de 20261114170000_projects_access_requests (access_requests).

-- Cada um vê os próprios pedidos; o dono vê os do workspace dele.
DROP POLICY IF EXISTS "access_requests_select" ON public.access_requests;
CREATE POLICY "access_requests_select" ON public.access_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()
    )
  );

/** Só o dono aprova (a pessoa entra no workspace) ou recusa. */
CREATE OR REPLACE FUNCTION public.review_access_request(_request_id uuid, _approve boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _req public.access_requests;
BEGIN
  SELECT * INTO _req FROM public.access_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR _req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esse pedido já foi respondido.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.servers s WHERE s.id = _req.server_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Só quem é dono do workspace pode responder pedidos.';
  END IF;

  UPDATE public.access_requests
    SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = _request_id;

  IF _approve THEN
    INSERT INTO public.server_members (server_id, user_id, role)
    VALUES (_req.server_id, _req.user_id, 'member')
    ON CONFLICT (server_id, user_id) DO NOTHING;
  END IF;
  RETURN _req.server_id;
END; $$;

/**
 * Entrar pelo link de convite. O código só é visível para quem já está no
 * workspace (a política de `servers` mostra a linha só a membros), então o
 * link só circula se alguém de dentro mandar.
 */
CREATE OR REPLACE FUNCTION public.join_server_by_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _server_id uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT id INTO _server_id
  FROM public.servers
  WHERE lower(invite_code) = lower(btrim(_code))
  LIMIT 1;

  IF _server_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.server_members (server_id, user_id)
  VALUES (_server_id, _me)
  ON CONFLICT DO NOTHING;

  -- Quem já tinha pedido para entrar não fica com o pedido pendurado.
  UPDATE public.access_requests
    SET status = 'approved', reviewed_at = now()
    WHERE server_id = _server_id AND user_id = _me AND status = 'pending';

  RETURN _server_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_access_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_server_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_access_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_server_by_invite(text) TO authenticated;

