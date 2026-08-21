CREATE OR REPLACE FUNCTION public.guard_profile_active_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _actor text;
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    -- Somente administradores (client) ou o servidor (service_role / triggers) podem mudar status.
    IF _uid IS NOT NULL AND NOT public.is_gestor() THEN
      RAISE EXCEPTION 'Somente administradores podem alterar o status (ativo/inativo) de um usuário';
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
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_active_change ON public.profiles;
CREATE TRIGGER trg_guard_profile_active_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_active_change();

REVOKE ALL ON FUNCTION public.guard_profile_active_change() FROM PUBLIC, anon, authenticated;