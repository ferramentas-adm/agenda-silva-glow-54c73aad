CREATE OR REPLACE FUNCTION public.reassign_agendamento_closer_for_result(
  _agendamento_id uuid,
  _new_closer_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _allowed boolean;
  _ag public.agendamentos;
  _old_closer_name text;
  _new_closer_name text;
  _sdr_name text;
  _sdr_lookup_id uuid;
  _actor_name text;
  _actor_email text;
  _new_closer_user uuid;
  _scheduled_iso text;
  _created_iso text;
  _start_dt text;
  _end_dt text;
  _calendar_link text;
  _status_display text;
  _payload jsonb;
  _webhook_url TEXT := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6';
BEGIN
  SELECT
    public.has_role(_uid, 'gestor'::app_role)
    OR public.has_role(_uid, 'supervisor'::app_role)
    OR (
      (public.has_role(_uid, 'moderador'::app_role) OR public.has_role(_uid, 'apresentador'::app_role))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = _uid AND p.moderador_tipo = 'sdr'
      )
    )
  INTO _allowed;

  IF NOT COALESCE(_allowed, false) THEN
    RAISE EXCEPTION 'Sem permissão para definir o closer que atendeu a reunião';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.closers WHERE id = _new_closer_id AND active) THEN
    RAISE EXCEPTION 'Closer destino inválido ou inativo';
  END IF;

  SELECT * INTO _ag FROM public.agendamentos
   WHERE id = _agendamento_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agendamento não encontrado';
  END IF;

  SELECT name INTO _old_closer_name FROM public.closers WHERE id = _ag.closer_id;
  SELECT name INTO _new_closer_name FROM public.closers WHERE id = _new_closer_id;

  UPDATE public.agendamentos
     SET closer_id = _new_closer_id,
         sdr_handoff_at = now(),
         closer_handoff_at = now(),
         closer_returned_at = NULL,
         closer_return_reason = NULL,
         updated_at = now()
   WHERE id = _agendamento_id;

  SELECT p.user_id INTO _new_closer_user
  FROM public.profiles p
  JOIN public.closers c ON lower(c.email) = lower(p.email)
  WHERE c.id = _new_closer_id
  LIMIT 1;

  IF _new_closer_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      _new_closer_user,
      'meeting_reassigned_for_result',
      'Registre o resultado da reunião',
      'Você foi definido como o closer que atendeu a reunião com ' || _ag.lead_name
        || ' em ' || to_char(_ag.scheduled_date, 'DD/MM') || ' às ' || _ag.scheduled_time || '.',
      'agendamento',
      _agendamento_id
    );
  END IF;

  SELECT full_name INTO _actor_name FROM public.profiles WHERE user_id = _uid;
  SELECT email INTO _actor_email FROM public.profiles WHERE user_id = _uid;
  INSERT INTO public.audit_logs (user_id, user_name, user_email, action, entity_type, entity_id, details)
  VALUES (
    COALESCE(_uid, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(_actor_name, 'Sistema'),
    _actor_email,
    'reassign_closer_for_result',
    'agendamento',
    _agendamento_id::text,
    jsonb_build_object(
      'lead_name', _ag.lead_name,
      'scheduled_date', _ag.scheduled_date,
      'scheduled_time', _ag.scheduled_time,
      'from_closer', COALESCE(_old_closer_name, ''),
      'to_closer', COALESCE(_new_closer_name, ''),
      'source', 'trava'
    )
  );

  _sdr_lookup_id := COALESCE(_ag.sdr_responsavel_id, _ag.created_by);
  IF _sdr_lookup_id IS NOT NULL THEN
    SELECT full_name INTO _sdr_name FROM public.profiles WHERE user_id = _sdr_lookup_id;
  END IF;

  _scheduled_iso := _ag.scheduled_date::text || 'T' || _ag.scheduled_time || ':00-03:00';
  _created_iso := to_char(_ag.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  _start_dt := replace(_ag.scheduled_date::text, '-', '') || 'T' || replace(_ag.scheduled_time, ':', '') || '00';
  _end_dt := replace(_ag.scheduled_date::text, '-', '') || 'T'
             || lpad(((split_part(_ag.scheduled_time, ':', 1)::int + 1)::text), 2, '0')
             || split_part(_ag.scheduled_time, ':', 2) || '00';
  _calendar_link := 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    || '&text=' || replace(replace('Grupo Silva & ' || _ag.lead_name, ' ', '+'), '&', '%26')
    || '&dates=' || _start_dt || '/' || _end_dt
    || '&ctz=America/Sao_Paulo';

  CASE _ag.status
    WHEN 'agendada' THEN _status_display := 'Agendado';
    WHEN 'realizada' THEN _status_display := 'Realizada';
    WHEN 'confirmada' THEN _status_display := 'Confirmada';
    WHEN 'reagendada' THEN _status_display := 'Reagendada';
    WHEN 'no_show' THEN _status_display := 'No-show';
    WHEN 'cancelada' THEN _status_display := 'Cancelar';
    ELSE _status_display := _ag.status::text;
  END CASE;

  _payload := jsonb_build_object(
    'evento', 'closer_atualizado',
    'lead_name', _ag.lead_name,
    'lead_phone', _ag.lead_phone,
    'status', _status_display,
    'scheduled_datetime', _scheduled_iso,
    'created_at', _created_iso,
    'sdr_name', COALESCE(_sdr_name, ''),
    'closer_name', COALESCE(_new_closer_name, ''),
    'briefing', COALESCE(_ag.briefing, ''),
    'meeting_reason', COALESCE(_ag.meeting_reason, ''),
    'is_segunda_reuniao', (_ag.meeting_reason = 'segunda_reuniao'),
    'is_vendido', NULL,
    'is_follow_up', NULL,
    'is_perdido', NULL,
    'channel_type', COALESCE(_ag.channel_type, ''),
    'meet_link', NULLIF(_ag.meet_link, ''),
    'calendar_link', _calendar_link,
    'deleted_at', NULL,
    'deletion_reason', NULL,
    'cancellation_reason', NULLIF(btrim(COALESCE(_ag.cancellation_reason, '')), ''),
    'nao_comparecimento_bucket', NULL,
    'lead_revenue', NULL,
    'vendeu', NULL,
    'valor_coletado', NULL,
    'resumo_venda', NULL,
    'motivo_nao_fechamento', NULL,
    'explicacao_nao_fechamento', NULL,
    'valor_apresentado', NULL,
    'follow_up_date', NULL,
    'follow_up_time', NULL,
    'observacoes', COALESCE(_ag.observation, ''),
    'recebimento_acordado', FALSE,
    'valor_previsto', NULL,
    'data_prevista', NULL
  );

  PERFORM net.http_post(
    url := _webhook_url,
    body := _payload,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_agendamento_closer_for_result(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_agendamento_closer_for_result(uuid, uuid) TO authenticated;