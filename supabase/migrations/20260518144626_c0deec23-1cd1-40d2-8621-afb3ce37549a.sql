
CREATE OR REPLACE FUNCTION public.detect_and_mark_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized_phone TEXT;
  _prior_id UUID;
BEGIN
  -- Só age em novas agendas criadas por SDR
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_role(NEW.created_by, 'sdr'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Se já vier como reagendada (fluxo manual de gestor/mod), não mexer
  IF NEW.status = 'reagendada' THEN
    RETURN NEW;
  END IF;

  -- Normaliza telefone (só dígitos)
  _normalized_phone := regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g');
  IF _normalized_phone = '' THEN
    RETURN NEW;
  END IF;

  -- Busca agenda anterior do mesmo telefone, criada por SDR,
  -- dentro de 7 dias (relativo a hoje), não deletada.
  SELECT a.id
    INTO _prior_id
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') = _normalized_phone
    AND a.scheduled_date >= (CURRENT_DATE - INTERVAL '7 days')
    AND a.created_by IS NOT NULL
    AND public.has_role(a.created_by, 'sdr'::app_role)
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF _prior_id IS NOT NULL THEN
    NEW.status := 'reagendada';
    NEW.original_agendamento_id := _prior_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_zz_detect_reschedule ON public.agendamentos;
CREATE TRIGGER trg_zz_detect_reschedule
BEFORE INSERT ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.detect_and_mark_reschedule();
