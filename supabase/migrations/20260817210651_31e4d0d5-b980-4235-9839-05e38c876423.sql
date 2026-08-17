CREATE OR REPLACE FUNCTION public.clear_sdr_override_on_gestor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'gestor'::app_role THEN
    UPDATE public.profiles
       SET is_sdr_override = false
     WHERE user_id = NEW.user_id
       AND is_sdr_override IS TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_sdr_override_on_gestor ON public.user_roles;
CREATE TRIGGER trg_clear_sdr_override_on_gestor
AFTER INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.clear_sdr_override_on_gestor();

UPDATE public.profiles p
   SET is_sdr_override = false
 WHERE p.is_sdr_override IS TRUE
   AND EXISTS (
     SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = p.user_id AND ur.role = 'gestor'::app_role
   );