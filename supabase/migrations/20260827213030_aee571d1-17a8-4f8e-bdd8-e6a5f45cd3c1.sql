CREATE OR REPLACE FUNCTION public.block_closer_block_on_busy_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_manager boolean;
  v_conflict record;
  v_start time;
  v_end time;
  v_today date;
BEGIN
  -- Gestão pode forçar bloqueios (ex.: bloqueio em massa)
  v_is_manager := public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'moderador')
    OR public.has_role(auth.uid(), 'supervisor');

  IF v_is_manager THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_start := NEW.start_time::time;
    v_end := NEW.end_time::time;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF COALESCE(NEW.is_recurring, false) AND NEW.recurrence_weekday IS NOT NULL THEN
    SELECT a.scheduled_date, a.scheduled_time, a.lead_name
      INTO v_conflict
    FROM public.agendamentos a
    WHERE a.closer_id = NEW.closer_id
      AND a.deleted_at IS NULL
      AND a.status IN ('pendente','confirmada','nao_confirmada','agendada','realizada')
      AND a.scheduled_date >= v_today
      AND EXTRACT(DOW FROM a.scheduled_date)::int = NEW.recurrence_weekday
      AND a.scheduled_time ~ '^[0-9]{1,2}:[0-9]{2}'
      AND (a.scheduled_time::time) < v_end
      AND ((a.scheduled_time::time) + make_interval(mins => COALESCE(a.duration_minutes, 60))) > v_start
    ORDER BY a.scheduled_date, a.scheduled_time
    LIMIT 1;
  ELSE
    SELECT a.scheduled_date, a.scheduled_time, a.lead_name
      INTO v_conflict
    FROM public.agendamentos a
    WHERE a.closer_id = NEW.closer_id
      AND a.deleted_at IS NULL
      AND a.status IN ('pendente','confirmada','nao_confirmada','agendada','realizada')
      AND a.scheduled_date = NEW.block_date
      AND a.scheduled_time ~ '^[0-9]{1,2}:[0-9]{2}'
      AND (a.scheduled_time::time) < v_end
      AND ((a.scheduled_time::time) + make_interval(mins => COALESCE(a.duration_minutes, 60))) > v_start
    ORDER BY a.scheduled_time
    LIMIT 1;
  END IF;

  IF v_conflict.scheduled_date IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível bloquear esse horário: já existe reunião agendada em % às % (lead: %). Só é permitido bloquear horários vazios.',
      to_char(v_conflict.scheduled_date, 'DD/MM/YYYY'),
      v_conflict.scheduled_time,
      COALESCE(v_conflict.lead_name, 'sem nome');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_closer_block_on_busy_slot ON public.closer_blocks;

CREATE TRIGGER trg_block_closer_block_on_busy_slot
BEFORE INSERT ON public.closer_blocks
FOR EACH ROW
EXECUTE FUNCTION public.block_closer_block_on_busy_slot();