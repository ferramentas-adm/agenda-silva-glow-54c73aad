CREATE OR REPLACE FUNCTION public.unassign_agendamentos_from_closer(_closer_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _closer_name text;
  _rows integer := 0;
  _rec record;
BEGIN
  IF _closer_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT name INTO _closer_name FROM public.closers WHERE id = _closer_id;

  FOR _rec IN
    UPDATE public.agendamentos a
       SET closer_id = NULL,
           status = 'pendente'::appointment_status,
           updated_at = now()
     WHERE a.closer_id = _closer_id
       AND a.deleted_at IS NULL
       AND a.scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
       AND a.status IN (
         'agendada'::appointment_status,
         'confirmada'::appointment_status,
         'nao_confirmada'::appointment_status,
         'pendente'::appointment_status
       )
       AND (a.meeting_reason IS NULL OR a.meeting_reason <> 'segunda_reuniao')
    RETURNING a.id, a.lead_name, a.scheduled_date, a.scheduled_time
  LOOP
    _rows := _rows + 1;

    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    SELECT ur.user_id,
           'pending_closer_assignment',
           'Reunião aguardando atribuição',
           'Reunião com ' || _rec.lead_name || ' em ' || to_char(_rec.scheduled_date, 'DD/MM')
             || ' às ' || _rec.scheduled_time || ' voltou para atribuição (Closer indisponível).',
           'agendamento',
           _rec.id
    FROM public.user_roles ur
    WHERE ur.role IN ('gestor'::app_role, 'moderador'::app_role, 'supervisor'::app_role);

    INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
    VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      'Sistema',
      'closer_deactivated_unassign',
      'agendamento',
      _rec.id::text,
      jsonb_build_object(
        'lead_name', _rec.lead_name,
        'scheduled_date', _rec.scheduled_date,
        'scheduled_time', _rec.scheduled_time,
        'closer_id', _closer_id,
        'closer_name', _closer_name,
        'reason', _reason
      )
    );
  END LOOP;

  RETURN _rows;
END;
$$;

REVOKE ALL ON FUNCTION public.unassign_agendamentos_from_closer(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unassign_agendamentos_from_closer(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.unassign_agendamentos_from_closer(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.on_closer_deactivated_unassign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.unassign_agendamentos_from_closer(OLD.id, 'closer_deleted');
    RETURN OLD;
  END IF;

  IF OLD.active = true AND NEW.active = false THEN
    PERFORM public.unassign_agendamentos_from_closer(NEW.id, 'closer_deactivated');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_closer_deactivated_unassign ON public.closers;
CREATE TRIGGER trg_closer_deactivated_unassign
AFTER UPDATE OF active ON public.closers
FOR EACH ROW
EXECUTE FUNCTION public.on_closer_deactivated_unassign();

DROP TRIGGER IF EXISTS trg_closer_deleted_unassign ON public.closers;
CREATE TRIGGER trg_closer_deleted_unassign
BEFORE DELETE ON public.closers
FOR EACH ROW
EXECUTE FUNCTION public.on_closer_deactivated_unassign();

-- Correção pontual: devolve reuniões futuras presas em closers já inativos
DO $$
DECLARE
  _c record;
BEGIN
  FOR _c IN SELECT id FROM public.closers WHERE active = false LOOP
    PERFORM public.unassign_agendamentos_from_closer(_c.id, 'backfill_closer_inactive');
  END LOOP;
END $$;