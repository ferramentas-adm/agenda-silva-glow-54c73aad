
-- ============================================================
-- Fase 2 — Helpers RLS com initplan + índices
-- ============================================================

-- 1. Helper functions (STABLE SECURITY DEFINER) --------------

CREATE OR REPLACE FUNCTION public.current_closer_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id
  FROM public.closers c
  WHERE c.email = (SELECT auth.email())
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'gestor'::app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['gestor','moderador','supervisor']::app_role[])
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_sdr()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['gestor','moderador','supervisor','sdr']::app_role[])
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_apresentador()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['gestor','moderador','supervisor','apresentador']::app_role[])
  )
$$;

CREATE OR REPLACE FUNCTION public.is_closer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'closer'::app_role
  )
$$;

-- 2. Policies -----------------------------------------------

-- ----- agendamentos -----
DROP POLICY IF EXISTS "Authenticated users can create agendamentos" ON public.agendamentos;
CREATE POLICY "Authenticated users can create agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can update agendamentos by role" ON public.agendamentos;
CREATE POLICY "Users can update agendamentos by role" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (
    public.is_manager_or_sdr()
    OR (SELECT auth.uid()) = created_by
    OR (public.is_closer() AND closer_id = public.current_closer_id())
  )
  WITH CHECK (
    public.is_manager_or_sdr()
    OR (SELECT auth.uid()) = created_by
    OR (public.is_closer() AND closer_id = public.current_closer_id())
  );

-- ----- audit_logs -----
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Gestors can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Moderadores can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Apresentador can view audit logs" ON public.audit_logs;
CREATE POLICY "Managers and apresentador can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_manager_or_apresentador());

-- ----- closer_google_tokens -----
DROP POLICY IF EXISTS "Gestors can manage google tokens" ON public.closer_google_tokens;
CREATE POLICY "Gestors can manage google tokens" ON public.closer_google_tokens
  FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Closers can read own google tokens" ON public.closer_google_tokens;
CREATE POLICY "Closers can read own google tokens" ON public.closer_google_tokens
  FOR SELECT TO authenticated
  USING (closer_id = public.current_closer_id());

-- ----- closers -----
DROP POLICY IF EXISTS "Gestors can manage closers" ON public.closers;
CREATE POLICY "Gestors can manage closers" ON public.closers
  FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Gestors can delete closers" ON public.closers;
CREATE POLICY "Gestors can delete closers" ON public.closers
  FOR DELETE TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "Closers can update own hours" ON public.closers;
CREATE POLICY "Closers can update own hours" ON public.closers
  FOR UPDATE TO authenticated
  USING (email = (SELECT auth.email()) OR public.is_manager())
  WITH CHECK (email = (SELECT auth.email()) OR public.is_manager());

-- ----- notifications -----
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ----- pagamentos -----
DROP POLICY IF EXISTS "Managers can delete pagamentos" ON public.pagamentos;
CREATE POLICY "Managers can delete pagamentos" ON public.pagamentos
  FOR DELETE TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Managers can update pagamentos" ON public.pagamentos;
CREATE POLICY "Managers can update pagamentos" ON public.pagamentos
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "Allowed users can insert pagamentos" ON public.pagamentos;
CREATE POLICY "Allowed users can insert pagamentos" ON public.pagamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = created_by
    AND (
      public.is_manager()
      OR (public.is_closer() AND (closer_id IS NULL OR closer_id = public.current_closer_id()))
    )
  );

-- ----- profiles -----
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Gestors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Moderadores can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Apresentador can view profiles" ON public.profiles;
CREATE POLICY "Managers and apresentador can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_manager_or_apresentador());

DROP POLICY IF EXISTS "Gestors can insert profiles" ON public.profiles;
CREATE POLICY "Gestors can insert profiles" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Gestors can update profiles" ON public.profiles;
CREATE POLICY "Gestors can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- ----- role_permissions -----
DROP POLICY IF EXISTS "Gestors can manage role permissions" ON public.role_permissions;
CREATE POLICY "Gestors can manage role permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- ----- user_roles -----
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Gestors can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Moderadores can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Supervisors can view all roles" ON public.user_roles;
CREATE POLICY "Managers can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Gestors can manage roles" ON public.user_roles;
CREATE POLICY "Gestors can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Gestors can delete roles" ON public.user_roles;
CREATE POLICY "Gestors can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_gestor());

-- ----- vendas -----
DROP POLICY IF EXISTS "Allowed users can insert vendas" ON public.vendas;
CREATE POLICY "Allowed users can insert vendas" ON public.vendas
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = created_by
    AND (
      public.is_manager()
      OR EXISTS (
        SELECT 1 FROM public.agendamentos a
        WHERE a.id = vendas.agendamento_id
          AND (
            a.created_by = (SELECT auth.uid())
            OR (public.is_closer() AND a.closer_id = public.current_closer_id())
          )
      )
    )
  );

DROP POLICY IF EXISTS "Allowed users can update vendas" ON public.vendas;
CREATE POLICY "Allowed users can update vendas" ON public.vendas
  FOR UPDATE TO authenticated
  USING (
    public.is_manager()
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = vendas.agendamento_id
        AND (
          a.created_by = (SELECT auth.uid())
          OR (public.is_closer() AND a.closer_id = public.current_closer_id())
        )
    )
  )
  WITH CHECK (
    public.is_manager()
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = vendas.agendamento_id
        AND (
          a.created_by = (SELECT auth.uid())
          OR (public.is_closer() AND a.closer_id = public.current_closer_id())
        )
    )
  );

DROP POLICY IF EXISTS "Gestors and moderators can delete vendas" ON public.vendas;
CREATE POLICY "Gestors and moderators can delete vendas" ON public.vendas
  FOR DELETE TO authenticated
  USING (public.is_manager());

-- 3. Índices (M10) ------------------------------------------

CREATE INDEX IF NOT EXISTS idx_agendamentos_scheduled_date_active
  ON public.agendamentos (scheduled_date) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_action_created
  ON public.audit_logs (entity_type, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_closers_email
  ON public.closers (email);

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);
