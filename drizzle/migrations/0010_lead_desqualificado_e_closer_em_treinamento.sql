ALTER TABLE public.agendamentos ADD COLUMN lead_desqualificado boolean NOT NULL DEFAULT false;
ALTER TABLE public.closers ADD COLUMN em_treinamento boolean NOT NULL DEFAULT false;

CREATE INDEX idx_agendamentos_lead_desqualificado ON public.agendamentos(lead_desqualificado) WHERE lead_desqualificado = true;

CREATE OR REPLACE FUNCTION public.enforce_desqualificado_closer_treinamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_closer_treinamento boolean;
BEGIN
  -- Ignora soft-deletes
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.closer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(em_treinamento, false) INTO v_closer_treinamento
  FROM public.closers
  WHERE id = NEW.closer_id;

  IF v_closer_treinamento IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_desqualificado AND NOT v_closer_treinamento THEN
    RAISE EXCEPTION 'Lead desqualificado só pode ser alocado com closer em treinamento.';
  END IF;

  IF NOT NEW.lead_desqualificado AND v_closer_treinamento THEN
    RAISE EXCEPTION 'Closer em treinamento só pode receber lead desqualificado.';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_enforce_desqualificado_closer_treinamento
BEFORE INSERT OR UPDATE OF closer_id, lead_desqualificado ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.enforce_desqualificado_closer_treinamento();

GRANT SELECT, INSERT, UPDATE ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.closers TO authenticated;
GRANT ALL ON public.closers TO service_role;