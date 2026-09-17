-- Conserto na origem: reunião pendente que recebe (ou troca de) closer passa a "agendada".
CREATE OR REPLACE FUNCTION public.promote_pendente_on_closer_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.closer_id IS NOT NULL
     AND NEW.status = 'pendente'
     AND OLD.closer_id IS DISTINCT FROM NEW.closer_id
     AND NEW.deleted_at IS NULL THEN
    NEW.status := 'agendada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_pendente_on_closer_assignment ON public.agendamentos;
CREATE TRIGGER trg_promote_pendente_on_closer_assignment
BEFORE UPDATE OF closer_id ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.promote_pendente_on_closer_assignment();