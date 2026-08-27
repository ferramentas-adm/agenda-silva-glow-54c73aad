-- 1) Tarefas: incluir supervisor
DROP POLICY IF EXISTS "Tasks select by role" ON public.tasks;
CREATE POLICY "Tasks select by role" ON public.tasks FOR SELECT TO authenticated
USING (
  public.is_manager()
  OR (public.has_role(auth.uid(), 'closer'::app_role) AND assigned_closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email()))
);

DROP POLICY IF EXISTS "Tasks insert by role" ON public.tasks;
CREATE POLICY "Tasks insert by role" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    public.is_manager()
    OR (public.has_role(auth.uid(), 'closer'::app_role) AND (assigned_closer_id IS NULL OR assigned_closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())))
  )
);

DROP POLICY IF EXISTS "Tasks update by role" ON public.tasks;
CREATE POLICY "Tasks update by role" ON public.tasks FOR UPDATE TO authenticated
USING (
  public.is_manager()
  OR (public.has_role(auth.uid(), 'closer'::app_role) AND assigned_closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email()))
)
WITH CHECK (
  public.is_manager()
  OR (public.has_role(auth.uid(), 'closer'::app_role) AND assigned_closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email()))
);

DROP POLICY IF EXISTS "Tasks delete by role" ON public.tasks;
CREATE POLICY "Tasks delete by role" ON public.tasks FOR DELETE TO authenticated
USING (
  public.is_manager()
  OR (public.has_role(auth.uid(), 'closer'::app_role) AND assigned_closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email()))
);

-- 2) Bloqueios de agenda: gestão completa para gestor/moderador/supervisor
DROP POLICY IF EXISTS "Closers can insert own blocks" ON public.closer_blocks;
CREATE POLICY "Closers can insert own blocks" ON public.closer_blocks FOR INSERT TO authenticated
WITH CHECK (
  closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())
  OR public.is_manager()
);

DROP POLICY IF EXISTS "Closers can delete own blocks" ON public.closer_blocks;
CREATE POLICY "Closers can delete own blocks" ON public.closer_blocks FOR DELETE TO authenticated
USING (
  closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())
  OR public.is_manager()
);

-- 3) Configurações gerais: incluir supervisor
DROP POLICY IF EXISTS "Managers can manage settings" ON public.app_settings;
CREATE POLICY "Managers can manage settings" ON public.app_settings FOR ALL TO authenticated
USING (public.is_manager()) WITH CHECK (public.is_manager());

-- 4) Revisão de erro de closer: permitir criação por gestor/moderador/supervisor
DROP POLICY IF EXISTS "Gestor can insert closer error reviews" ON public.closer_error_reviews;
CREATE POLICY "Managers can insert closer error reviews" ON public.closer_error_reviews FOR INSERT TO authenticated
WITH CHECK (public.is_manager());

-- 5) Ativação/inativação de usuários por moderador (exceto moderadores/gestores e a própria conta)
CREATE OR REPLACE FUNCTION public.can_toggle_user_active(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_gestor()
    OR (
      public.has_role(auth.uid(), 'moderador'::app_role)
      AND _target_user_id <> auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _target_user_id
          AND ur.role IN ('gestor'::app_role, 'moderador'::app_role)
      )
    )
$$;

DROP POLICY IF EXISTS "Gestors can update profiles" ON public.profiles;
CREATE POLICY "Managers can update profiles" ON public.profiles FOR UPDATE TO authenticated
USING (public.is_gestor() OR public.can_toggle_user_active(user_id))
WITH CHECK (public.is_gestor() OR public.can_toggle_user_active(user_id));

CREATE OR REPLACE FUNCTION public.guard_profile_active_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _actor text;
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    -- Gestor: qualquer conta. Moderador: apenas contas que não são gestor/moderador e nunca a própria.
    -- Servidor (service_role / triggers) tem auth.uid() nulo e passa direto.
    IF _uid IS NOT NULL AND NOT public.can_toggle_user_active(NEW.user_id) THEN
      RAISE EXCEPTION 'Sem permissão para alterar o status (ativo/inativo) deste usuário';
    END IF;

    SELECT full_name INTO _actor FROM public.profiles WHERE user_id = _uid;

    INSERT INTO public.audit_logs (user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (
      COALESCE(_uid, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(_actor, 'Servidor (painel administrativo)'),
      (SELECT auth.email()),
      CASE WHEN NEW.active THEN 'activate_user' ELSE 'deactivate_user' END,
      'user',
      NEW.user_id::text,
      jsonb_build_object(
        'name', NEW.full_name,
        'email', NEW.email,
        'from', OLD.active,
        'to', NEW.active
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;