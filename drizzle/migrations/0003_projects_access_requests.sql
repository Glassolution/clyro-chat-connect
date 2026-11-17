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