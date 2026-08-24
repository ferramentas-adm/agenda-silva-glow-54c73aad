CREATE OR REPLACE FUNCTION public.trg_meta_capi_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND COALESCE(NEW.is_venda_avulsa, FALSE) = FALSE THEN
    PERFORM public.notify_meta_capi('Schedule', NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_meta_capi_schedule() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_meta_capi_schedule ON public.agendamentos;
CREATE TRIGGER trg_meta_capi_schedule
AFTER INSERT ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_schedule();