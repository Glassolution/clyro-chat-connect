-- Tasks e reuniões agendadas do workspace: o que o painel mostra como "para
-- fazer", "delegadas" e "agenda". Quem é do workspace vê tudo; quem criou, a
-- pessoa responsável e os admins mexem.

-- ---------------------------------------------------------------------------
-- TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'todo',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT tasks_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT tasks_status CHECK (status IN ('todo', 'doing', 'done'))
);
CREATE INDEX IF NOT EXISTS tasks_server_idx ON public.tasks (server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks (assignee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

-- Cria quem é do workspace, e só pode delegar para quem também é.
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_server_member(server_id, auth.uid())
    AND (assignee_id IS NULL OR public.is_server_member(server_id, assignee_id))
  );

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR public.is_workspace_admin(server_id, auth.uid())
  )
  WITH CHECK (
    public.is_server_member(server_id, auth.uid())
    AND (assignee_id IS NULL OR public.is_server_member(server_id, assignee_id))
  );

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- REUNIÕES AGENDADAS
CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meetings_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT meetings_duration CHECK (duration_min BETWEEN 5 AND 480)
);
CREATE INDEX IF NOT EXISTS meetings_server_idx ON public.meetings (server_id, starts_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meetings_select" ON public.meetings;
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "meetings_insert" ON public.meetings;
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "meetings_update" ON public.meetings;
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()))
  WITH CHECK (public.is_server_member(server_id, auth.uid()));

DROP POLICY IF EXISTS "meetings_delete" ON public.meetings;
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_workspace_admin(server_id, auth.uid()));

-- O painel atualiza sozinho quando alguém cria ou conclui algo.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL;
END $$;