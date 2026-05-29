CREATE OR REPLACE FUNCTION public.notify_status_change_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _status_display TEXT;
  _payload JSONB;
  _closer_name TEXT;
  _sdr_name TEXT;
  _sdr_lookup_id UUID;
  _calendar_link TEXT;
  _start_dt TEXT;
  _end_dt TEXT;
  _scheduled_iso TEXT;
  _created_iso TEXT;
  _is_deletion BOOLEAN := FALSE;
  _is_segunda BOOLEAN;
  _webhook_url TEXT := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _is_deletion := TRUE;
    ELSIF OLD.status IS NOT DISTINCT FROM NEW.status AND NOT _is_deletion THEN
      RETURN NEW;
    ELSIF NEW.status NOT IN ('agendada', 'realizada', 'cancelada', 'no_show', 'confirmada', 'reagendada') AND NOT _is_deletion THEN
      RETURN NEW;
    END IF;
  END IF;

  _scheduled_iso := NEW.scheduled_date::text || 'T' || NEW.scheduled_time || ':00Z';
  _created_iso := to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  _is_segunda := (NEW.meeting_reason = 'segunda_reuniao');

  IF NEW.closer_id IS NOT NULL THEN
    SELECT name INTO _closer_name FROM public.closers WHERE id = NEW.closer_id;
  END IF;

  IF _is_segunda THEN
    -- Para segunda reunião, o SDR enviado é quem trouxe o lead originalmente:
    -- primeiro agendamento (mais antigo, não excluído) com o mesmo telefone
    -- normalizado cujo criador tem role 'sdr'.
    SELECT p.full_name INTO _sdr_name
    FROM public.agendamentos a
    JOIN public.user_roles ur
      ON ur.user_id = a.created_by AND ur.role = 'sdr'::app_role
    LEFT JOIN public.profiles p ON p.user_id = a.created_by
    WHERE a.deleted_at IS NULL
      AND a.id <> NEW.id
      AND regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g')
          = regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g')
      AND regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g') <> ''
    ORDER BY a.created_at ASC
    LIMIT 1;
    -- Se não achar, _sdr_name fica NULL → COALESCE manda string vazia.
  ELSE
    _sdr_lookup_id := COALESCE(NEW.sdr_responsavel_id, NEW.created_by);
    IF _sdr_lookup_id IS NOT NULL THEN
      SELECT full_name INTO _sdr_name FROM public.profiles WHERE user_id = _sdr_lookup_id;
    END IF;
  END IF;

  IF _is_deletion THEN
    _status_display := 'Excluída';

    _payload := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'lead_phone', NEW.lead_phone,
      'status', _status_display,
      'scheduled_datetime', _scheduled_iso,
      'created_at', _created_iso,
      'deleted_at', to_char(NEW.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'deletion_reason', COALESCE(NEW.deletion_reason, ''),
      'sdr_name', COALESCE(_sdr_name, ''),
      'briefing', COALESCE(NEW.briefing, ''),
      'meeting_reason', COALESCE(NEW.meeting_reason, ''),
      'is_segunda_reuniao', _is_segunda,
      'channel_type', COALESCE(NEW.channel_type, '')
    );

    IF _closer_name IS NOT NULL THEN
      _payload := _payload || jsonb_build_object('closer_name', _closer_name);
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      IF NEW.original_agendamento_id IS NOT NULL THEN
        _status_display := 'Reagendada';
      ELSE
        CASE NEW.status
          WHEN 'agendada' THEN _status_display := 'Agendado';
          WHEN 'confirmada' THEN _status_display := 'Confirmada';
          WHEN 'reagendada' THEN _status_display := 'Reagendada';
          ELSE _status_display := NEW.status::text;
        END CASE;
      END IF;
    ELSE
      CASE NEW.status
        WHEN 'agendada' THEN _status_display := 'Agendado';
        WHEN 'realizada' THEN _status_display := 'Realizada';
        WHEN 'cancelada' THEN _status_display := 'Cancelar';
        WHEN 'no_show' THEN _status_display := 'No-show';
        WHEN 'confirmada' THEN _status_display := 'Confirmada';
        WHEN 'reagendada' THEN _status_display := 'Reagendada';
        ELSE _status_display := NEW.status::text;
      END CASE;
    END IF;

    _payload := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'lead_phone', NEW.lead_phone,
      'status', _status_display,
      'scheduled_datetime', _scheduled_iso,
      'created_at', _created_iso,
      'sdr_name', COALESCE(_sdr_name, ''),
      'briefing', COALESCE(NEW.briefing, ''),
      'meeting_reason', COALESCE(NEW.meeting_reason, ''),
      'is_segunda_reuniao', _is_segunda,
      'channel_type', COALESCE(NEW.channel_type, '')
    );

    IF _closer_name IS NOT NULL THEN
      _payload := _payload || jsonb_build_object('closer_name', _closer_name);
    END IF;

    IF NEW.meet_link IS NOT NULL AND NEW.meet_link <> '' THEN
      _payload := _payload || jsonb_build_object('meet_link', NEW.meet_link);
    END IF;

    _start_dt := replace(NEW.scheduled_date::text, '-', '') || 'T' || replace(NEW.scheduled_time, ':', '') || '00';
    _end_dt := replace(NEW.scheduled_date::text, '-', '') || 'T' || lpad(((split_part(NEW.scheduled_time, ':', 1)::int + 1)::text), 2, '0') || split_part(NEW.scheduled_time, ':', 2) || '00';

    _calendar_link := 'https://calendar.google.com/calendar/render?action=TEMPLATE'
      || '&text=' || replace(replace('Grupo Silva & ' || NEW.lead_name, ' ', '+'), '&', '%26')
      || '&dates=' || _start_dt || '/' || _end_dt
      || '&ctz=America/Sao_Paulo';

    _payload := _payload || jsonb_build_object('calendar_link', _calendar_link);
  END IF;

  PERFORM net.http_post(
    url := _webhook_url,
    body := _payload,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$function$;