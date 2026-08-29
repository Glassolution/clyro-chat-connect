-- Sinal de vida da presença em call. Sem ele, uma aba fechada de qualquer jeito
-- (queda, reload, computador dormindo) deixava a pessoa na lista para sempre,
-- porque a saída só era escrita quando o clique em "sair" acontecia.
ALTER TABLE public.voice_states
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz NOT NULL DEFAULT now();

-- Faxina de fantasmas: quem está sem sinal há mais de dois minutos sai da lista.
-- Roda em qualquer escrita na tabela, que é quando alguém está de olho nela.
CREATE OR REPLACE FUNCTION public.prune_stale_voice_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.voice_states
  WHERE heartbeat_at < now() - interval '2 minutes';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS voice_states_prune ON public.voice_states;
CREATE TRIGGER voice_states_prune
  AFTER INSERT OR UPDATE ON public.voice_states
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prune_stale_voice_states();
