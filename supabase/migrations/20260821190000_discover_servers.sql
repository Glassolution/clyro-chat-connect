-- DESCOBRIR SERVIDORES
-- A política servers_select só deixa ver servidores dos quais você já participa,
-- então a descoberta precisa de uma função SECURITY DEFINER: ela expõe apenas os
-- campos públicos e a contagem de membros, sem abrir a tabela inteira.

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION public.discover_servers(_search text DEFAULT NULL, _limit int DEFAULT 48)
RETURNS TABLE (
  id uuid,
  name text,
  icon_url text,
  description text,
  member_count bigint,
  is_member boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.name,
    s.icon_url,
    s.description,
    count(m.user_id) AS member_count,
    coalesce(bool_or(m.user_id = auth.uid()), false) AS is_member
  FROM public.servers s
  LEFT JOIN public.server_members m ON m.server_id = s.id
  WHERE s.is_public
    AND (
      _search IS NULL
      OR btrim(_search) = ''
      OR s.name ILIKE '%' || btrim(_search) || '%'
    )
  GROUP BY s.id
  ORDER BY count(m.user_id) DESC, s.name ASC
  LIMIT least(greatest(coalesce(_limit, 48), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.discover_servers(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_servers(text, int) TO authenticated;
