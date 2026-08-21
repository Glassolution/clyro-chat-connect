CREATE OR REPLACE FUNCTION public.join_server_by_invite(_code text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _server_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
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
  VALUES (_server_id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN _server_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_server_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_server_by_invite(text) TO authenticated;