CREATE OR REPLACE FUNCTION public.transfer_agendamento_closer(_agendamento_id uuid, _new_closer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cur uuid;
BEGIN
  SELECT closer_id INTO _cur FROM public.agendamentos WHERE id = _agendamento_id AND deleted_at IS NULL;
  IF _cur IS NULL AND NOT public.is_manager() THEN
    RAISE EXCEPTION 'Agendamento não encontrado ou sem closer';
  END IF;

  IF NOT (public.is_manager() OR (public.is_closer() AND _cur = public.current_closer_id())) THEN
    RAISE EXCEPTION 'Sem permissão para transferir este agendamento';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.closers WHERE id = _new_closer_id AND active) THEN
    RAISE EXCEPTION 'Closer destino inválido ou inativo';
  END IF;

  UPDATE public.agendamentos
     SET closer_id = _new_closer_id,
         meet_link = NULL,
         google_event_id = NULL,
         updated_at = now()
   WHERE id = _agendamento_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_agendamento_closer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_agendamento_closer(uuid, uuid) TO authenticated;