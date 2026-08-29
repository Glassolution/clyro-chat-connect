-- CATEGORIAS DE CANAL
-- Seções nomeadas pelo dono do servidor ("Social", "Empresas"...) que agrupam
-- canais. Canal sem categoria continua válido: cai nos grupos padrão de texto e
-- de voz, então nada quebra nos servidores que já existem.

CREATE TABLE IF NOT EXISTS public.channel_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_categories_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 48)
);

CREATE INDEX IF NOT EXISTS channel_categories_server_position_idx
  ON public.channel_categories (server_id, position);

-- ON DELETE SET NULL: apagar a categoria devolve os canais para os grupos
-- padrão em vez de apagar conversa junto.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.channel_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS channels_category_idx ON public.channels (category_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_categories TO authenticated;
GRANT ALL ON public.channel_categories TO service_role;
ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;

-- Quem é do servidor enxerga as categorias; só o dono cria, renomeia e apaga.
DROP POLICY IF EXISTS "channel_categories_select" ON public.channel_categories;
CREATE POLICY "channel_categories_select" ON public.channel_categories
  FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "channel_categories_insert" ON public.channel_categories;
CREATE POLICY "channel_categories_insert" ON public.channel_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "channel_categories_update" ON public.channel_categories;
CREATE POLICY "channel_categories_update" ON public.channel_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "channel_categories_delete" ON public.channel_categories;
CREATE POLICY "channel_categories_delete" ON public.channel_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid())
  );
