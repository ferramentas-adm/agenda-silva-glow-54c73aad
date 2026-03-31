
CREATE OR REPLACE FUNCTION public.notify_status_change_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status_display TEXT;
  _webhook_url TEXT := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6';
BEGIN
  -- For UPDATEs: only fire if status actually changed and is in the allowed list
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
      RETURN NEW;
    END IF;
    IF NEW.status NOT IN ('realizada', 'cancelada', 'no_show', 'nao_confirmada', 'confirmada') THEN
      RETURN NEW;
    END IF;
  END IF;

  CASE NEW.status
    WHEN 'realizada' THEN _status_display := 'Realizada';
    WHEN 'cancelada' THEN _status_display := 'Cancelar';
    WHEN 'no_show' THEN _status_display := 'No-show';
    WHEN 'nao_confirmada' THEN _status_display := 'Não Confirmada';
    WHEN 'confirmada' THEN _status_display := 'Confirmada';
    WHEN 'pendente' THEN _status_display := 'Pendente';
    WHEN 'reagendada' THEN _status_display := 'Reagendada';
    ELSE _status_display := NEW.status::text;
  END CASE;

  PERFORM net.http_post(
    url := _webhook_url,
    body := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'lead_phone', NEW.lead_phone,
      'status', _status_display
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
END;
$$;
