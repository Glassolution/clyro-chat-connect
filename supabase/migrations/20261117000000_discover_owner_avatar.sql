-- FOTO DE QUEM CRIOU NA VITRINE
-- Comunidade sem logo mostrava o mascote. Agora a vitrine devolve também a
-- foto de perfil do dono, que o app usa no lugar do logo quando não há um.
-- Mudar as colunas de retorno exige recriar a função.
--
-- Depende de 20261114170000_projects_access_requests (discover_projects).

DROP FUNCTION IF EXISTS public.discover_projects(text, text, int);

CREATE FUNCTION public.discover_projects(
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
  created_at timestamptz,
  owner_avatar text
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
    s.created_at,
    (SELECT p.avatar_url FROM public.profiles p WHERE p.id = s.owner_id) AS owner_avatar
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

GRANT EXECUTE ON FUNCTION public.discover_projects(text, text, int) TO anon, authenticated;
