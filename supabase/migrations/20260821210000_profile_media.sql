-- FOTOS DE PERFIL E BANNER
-- Bucket público para avatar e banner. Cada pessoa escreve apenas dentro da
-- pasta com o próprio id, então ninguém sobrescreve a imagem de outro.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública: as imagens aparecem para qualquer pessoa que veja o perfil.
DROP POLICY IF EXISTS "profile_media_read" ON storage.objects;
CREATE POLICY "profile_media_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'profile-media');

-- Escrita restrita à própria pasta: primeiro segmento do caminho = id do usuário.
DROP POLICY IF EXISTS "profile_media_insert_own" ON storage.objects;
CREATE POLICY "profile_media_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_media_update_own" ON storage.objects;
CREATE POLICY "profile_media_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_media_delete_own" ON storage.objects;
CREATE POLICY "profile_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
