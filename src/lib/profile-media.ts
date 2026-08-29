import { supabase } from "@/integrations/supabase/client";

/**
 * Imagens de perfil, banner e ícone de servidor moram num bucket **privado**:
 * nada é servido por URL pública. O que fica salvo no banco é um link assinado
 * de validade longa, que abre para quem receber e não expõe o resto do bucket.
 */
export const PROFILE_MEDIA_BUCKET = "profile-media";

/** Dez anos. O link vai para o perfil de todo mundo; não pode vencer no meio. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const MISSING_BUCKET_MESSAGE =
  "O armazenamento de imagens ainda não existe. Aplique a migração profile_media no Supabase.";

export type UploadOutcome = { ok: true; url: string } | { ok: false; error: string };

/**
 * Sobe uma imagem para a pasta do próprio usuário — é o que a política de
 * escrita exige — e devolve o link assinado pronto para guardar no banco.
 */
export async function uploadProfileImage(
  userId: string,
  file: File,
  kind: string,
): Promise<UploadOutcome> {
  if (!file.type.startsWith("image/")) return { ok: false, error: "Escolha um arquivo de imagem." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "A imagem precisa ter até 2 MB." };

  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${userId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    return {
      ok: false,
      error: /bucket/i.test(error.message)
        ? MISSING_BUCKET_MESSAGE
        : "Não foi possível enviar a imagem.",
    };
  }

  const url = await signPath(path);
  if (!url) {
    return { ok: false, error: "A imagem subiu, mas não foi possível gerar o link de acesso." };
  }
  return { ok: true, url };
}

/** Link assinado de longa duração para um caminho dentro do bucket. */
export async function signPath(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROFILE_MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Caminho dentro do bucket a partir de uma URL dele — serve tanto para o
 * formato público antigo quanto para um link assinado.
 */
export function pathFromMediaUrl(url: string): string | null {
  const match = new RegExp(
    `/storage/v1/object/(?:public|sign)/${PROFILE_MEDIA_BUCKET}/([^?]+)`,
  ).exec(url);
  const path = match?.[1];
  return path ? decodeURIComponent(path) : null;
}

/** Link do tempo em que o bucket era público — hoje não abre mais. */
export function isLegacyPublicUrl(url: string) {
  return url.includes(`/storage/v1/object/public/${PROFILE_MEDIA_BUCKET}/`);
}

/**
 * Converte um link público antigo em link assinado. Devolve `null` quando não
 * há o que fazer: link já assinado, vazio ou de fora do bucket.
 */
export async function resignLegacyUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !isLegacyPublicUrl(url)) return null;
  const path = pathFromMediaUrl(url);
  if (!path) return null;
  return signPath(path);
}
