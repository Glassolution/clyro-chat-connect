-- Imagens de perfil, banner e ícone de servidor saem do acesso público: o
-- bucket passa a ser privado e o app guarda um link assinado de validade longa.
-- Quem tem o link abre a imagem; o resto do bucket continua fechado.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-media',
  'profile-media',
  false,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Assinar um link exige poder ler o objeto: a leitura continua liberada para
-- quem tem sessão (é assim que um perfil mostra a foto de outro), mas deixa de
-- valer para visitantes anônimos, que só chegam pelo link assinado.
DROP POLICY IF EXISTS "profile_media_read" ON storage.objects;
CREATE POLICY "profile_media_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'profile-media');
