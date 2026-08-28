-- DESCOBERTA DE COMUNIDADES
-- Substitui discover_servers para a vitrine da home: além dos campos públicos,
-- devolve created_at e aceita uma ordenação, para as abas "Em alta" e "Novas".
--
-- A migração é autossuficiente de propósito: recria as colunas com IF NOT EXISTS
-- e o índice, então aplicar só este arquivo já deixa a descoberta funcionando,
-- mesmo que a migração anterior (20260821190000) ainda não tenha rodado.

ALTER TABLE public.servers
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS servers_is_public_created_at_idx
  ON public.servers (is_public, created_at DESC);

-- A assinatura muda (ganha _sort), então a versão antiga sai de cena.
DROP FUNCTION IF EXISTS public.discover_servers(text, int);

CREATE OR REPLACE FUNCTION public.discover_servers(
  _search text DEFAULT NULL,
  _limit int DEFAULT 48,
  _sort text DEFAULT 'popular'
)
RETURNS TABLE (
  id uuid,
  name text,
  icon_url text,
  description text,
  member_count bigint,
  is_member boolean,
  created_at timestamptz
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
    coalesce(bool_or(m.user_id = auth.uid()), false) AS is_member,
    s.created_at
  FROM public.servers s
  LEFT JOIN public.server_members m ON m.server_id = s.id
  WHERE s.is_public
    AND (
      _search IS NULL
      OR btrim(_search) = ''
      OR s.name ILIKE '%' || btrim(_search) || '%'
      OR coalesce(s.description, '') ILIKE '%' || btrim(_search) || '%'
    )
  GROUP BY s.id
  ORDER BY
    CASE WHEN _sort = 'new' THEN s.created_at END DESC,
    CASE WHEN _sort = 'new' THEN NULL ELSE count(m.user_id) END DESC,
    s.name ASC
  LIMIT least(greatest(coalesce(_limit, 48), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.discover_servers(text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_servers(text, int, text) TO authenticated;
