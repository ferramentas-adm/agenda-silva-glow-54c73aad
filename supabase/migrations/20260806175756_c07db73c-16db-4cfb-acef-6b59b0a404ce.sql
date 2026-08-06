CREATE OR REPLACE FUNCTION public.sync_closer_active_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
  _available BOOLEAN;
BEGIN
  IF NEW.role = 'closer'::app_role THEN
    RETURN NEW;
  END IF;

  SELECT p.email, COALESCE(p.available_for_scheduling, false)
    INTO _email, _available
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF _email IS NULL OR _available THEN
    RETURN NEW;
  END IF;

  -- Se o usuário tem outra função de closer registrada, não desativa.
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = NEW.user_id
      AND ur.role = 'closer'::app_role
      AND ur.id <> NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.closers
     SET active = false
   WHERE lower(email) = lower(_email)
     AND active = true;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_closer_active_on_role_change() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_sync_closer_active_on_role_change ON public.user_roles;
CREATE TRIGGER trg_sync_closer_active_on_role_change
AFTER INSERT OR UPDATE OF role ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_closer_active_on_role_change();