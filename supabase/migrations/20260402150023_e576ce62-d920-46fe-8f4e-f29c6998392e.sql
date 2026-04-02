
-- Update webhook function to also handle INSERT events
CREATE OR REPLACE FUNCTION public.notify_status_change_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status_display TEXT;
  _payload JSONB;
  _closer_name TEXT;
  _calendar_link TEXT;
  _start_dt TEXT;
  _end_dt TEXT;
  _scheduled_iso TEXT;
  _created_iso TEXT;
  _is_deletion BOOLEAN := FALSE;
  _webhook_url TEXT := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _is_deletion := TRUE;
    ELSIF OLD.status IS NOT DISTINCT FROM NEW.status AND NOT _is_deletion THEN
      RETURN NEW;
    ELSIF NEW.status NOT IN ('realizada', 'cancelada', 'no_show', 'confirmada', 'reagendada') AND NOT _is_deletion THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build ISO datetimes
  _scheduled_iso := NEW.scheduled_date::text || 'T' || NEW.scheduled_time || ':00Z';
  _created_iso := to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

  IF NEW.closer_id IS NOT NULL THEN
    SELECT name INTO _closer_name FROM public.closers WHERE id = NEW.closer_id;
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
      'deletion_reason', COALESCE(NEW.deletion_reason, '')
    );

    IF _closer_name IS NOT NULL THEN
      _payload := _payload || jsonb_build_object('closer_name', _closer_name);
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      CASE NEW.status
        WHEN 'confirmada' THEN _status_display := 'Confirmada';
        WHEN 'reagendada' THEN _status_display := 'Reagendada';
        ELSE _status_display := NEW.status::text;
      END CASE;
    ELSE
      CASE NEW.status
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
      'created_at', _created_iso
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
$$;

-- Create function to trigger CRM sync edge function on new agendamentos
CREATE OR REPLACE FUNCTION public.notify_crm_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url TEXT := 'https://jrnyccjhsxcggmgupvzp.supabase.co';
  _anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnljY2poc3hjZ2dtZ3VwdnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjk0MjcsImV4cCI6MjA4OTcwNTQyN30.oMrALsWvEwRBZT9pNkrNNxWtvQOl5eRjsWruiWP84Dc';
BEGIN
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/datacrazy-crm-sync',
    body := jsonb_build_object('record', row_to_json(NEW)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key,
      'apikey', _anon_key
    )
  );
  RETURN NEW;
END;
$$;

-- Attach webhook trigger for both INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_agendamento_status_webhook ON public.agendamentos;
CREATE TRIGGER trg_agendamento_status_webhook
  AFTER INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_status_change_webhook();

-- Attach CRM sync trigger for INSERT only
DROP TRIGGER IF EXISTS trg_agendamento_crm_sync ON public.agendamentos;
CREATE TRIGGER trg_agendamento_crm_sync
  AFTER INSERT ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_crm_sync();
