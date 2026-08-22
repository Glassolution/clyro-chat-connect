-- PERSONALIZAÇÃO DE PERFIL
-- Campos opcionais que o usuário controla. As políticas existentes já cobrem:
-- profiles_select é público e profiles_update_own limita a escrita ao dono.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS pronouns text,
  ADD COLUMN IF NOT EXISTS banner_color text;

-- Limites de tamanho para o perfil não virar um campo livre gigante.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_bio_length,
  ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR length(bio) <= 280);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pronouns_length,
  ADD CONSTRAINT profiles_pronouns_length CHECK (pronouns IS NULL OR length(pronouns) <= 40);

-- Cor do banner aceita só hex (#rgb ou #rrggbb), já que vai direto para o CSS.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_banner_color_format,
  ADD CONSTRAINT profiles_banner_color_format
    CHECK (banner_color IS NULL OR banner_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
