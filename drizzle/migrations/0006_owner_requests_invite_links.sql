-- PEDIDOS SÓ PARA O DONO E LINK DE CONVITE
-- Duas regras novas:
--   1. Quem pede para entrar numa startup é respondido só pelo dono do
--      workspace. Admin continua convidando e organizando equipes, mas não
--      aprova nem vê os pedidos.
--   2. O link de convite (/convite/<código>) é o aceite: quem abre entra na
--      hora. Se a pessoa tinha um pedido pendente, ele fica como aprovado.
--
-- Depende de 20261114170000_projects_access_requests (access_requests).

-- Cada um vê os próprios pedidos; o dono vê os do workspace dele.
DROP POLICY IF EXISTS "access_requests_select" ON public.access_requests;
CREATE POLICY "access_requests_select" ON public.access_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.servers s WHERE s.id = server_id AND s.owner_id = auth.uid()
    )
  );

/** Só o dono aprova (a pessoa entra no workspace) ou recusa. */
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
  IF NOT EXISTS (
    SELECT 1 FROM public.servers s WHERE s.id = _req.server_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Só quem é dono do workspace pode responder pedidos.';
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

/**
 * Entrar pelo link de convite. O código só é visível para quem já está no
 * workspace (a política de `servers` mostra a linha só a membros), então o
 * link só circula se alguém de dentro mandar.
 */
CREATE OR REPLACE FUNCTION public.join_server_by_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _server_id uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT id INTO _server_id
  FROM public.servers
  WHERE lower(invite_code) = lower(btrim(_code))
  LIMIT 1;

  IF _server_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.server_members (server_id, user_id)
  VALUES (_server_id, _me)
  ON CONFLICT DO NOTHING;

  -- Quem já tinha pedido para entrar não fica com o pedido pendurado.
  UPDATE public.access_requests
    SET status = 'approved', reviewed_at = now()
    WHERE server_id = _server_id AND user_id = _me AND status = 'pending';

  RETURN _server_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_access_request(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_server_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_access_request(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_server_by_invite(text) TO authenticated;