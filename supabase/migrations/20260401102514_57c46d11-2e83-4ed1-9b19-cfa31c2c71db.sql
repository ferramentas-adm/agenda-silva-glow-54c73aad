
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
  _webhook_url TEXT := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('realizada', 'cancelada', 'no_show', 'confirmada', 'reagendada') THEN
      RETURN NEW;
    END IF;
  END IF;

  CASE NEW.status
    WHEN 'realizada' THEN _status_display := 'Realizada';
    WHEN 'cancelada' THEN _status_display := 'Cancelar';
    WHEN 'no_show' THEN _status_display := 'No-show';
    WHEN 'confirmada' THEN _status_display := 'Confirmada';
    WHEN 'reagendada' THEN _status_display := 'Reagendada';
    ELSE _status_display := NEW.status::text;
  END CASE;

  -- Fetch closer name
  IF NEW.closer_id IS NOT NULL THEN
    SELECT name INTO _closer_name FROM public.closers WHERE id = NEW.closer_id;
  END IF;

  _payload := jsonb_build_object(
    'lead_name', NEW.lead_name,
    'lead_phone', NEW.lead_phone,
    'status', _status_display
  );

  -- Always include closer name when available
  IF _closer_name IS NOT NULL THEN
    _payload := _payload || jsonb_build_object('closer_name', _closer_name);
  END IF;

  IF NEW.status IN ('confirmada', 'reagendada') THEN
    _payload := _payload || jsonb_build_object(
      'scheduled_date', NEW.scheduled_date::text,
      'scheduled_time', NEW.scheduled_time
    );
  END IF;

  -- Always include meet_link when available
  IF NEW.meet_link IS NOT NULL AND NEW.meet_link <> '' THEN
    _payload := _payload || jsonb_build_object(
      'meet_link', NEW.meet_link
    );
  END IF;

  PERFORM net.http_post(
    url := _webhook_url,
    body := _payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
END;
$function$;
