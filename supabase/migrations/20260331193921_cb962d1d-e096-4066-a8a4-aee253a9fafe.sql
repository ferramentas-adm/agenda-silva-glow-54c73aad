
-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Create trigger function to send webhook on status change
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
  -- Only proceed if status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Only trigger for specific statuses
  IF NEW.status NOT IN ('realizada', 'cancelada', 'no_show', 'nao_confirmada') THEN
    RETURN NEW;
  END IF;

  -- Map internal enum to display name
  CASE NEW.status
    WHEN 'realizada' THEN _status_display := 'Realizada';
    WHEN 'cancelada' THEN _status_display := 'Cancelar';
    WHEN 'no_show' THEN _status_display := 'No-show';
    WHEN 'nao_confirmada' THEN _status_display := 'Não Confirmada';
    ELSE _status_display := NEW.status::text;
  END CASE;

  -- Send HTTP POST via pg_net
  PERFORM net.http_post(
    url := _webhook_url,
    body := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'status', _status_display
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    )
  );

  RETURN NEW;
END;
$$;

-- Create trigger on agendamentos table
DROP TRIGGER IF EXISTS trg_status_change_webhook ON public.agendamentos;
CREATE TRIGGER trg_status_change_webhook
  AFTER UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_status_change_webhook();
