ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS meta_lead_id text,
  ADD COLUMN IF NOT EXISTS lead_email text,
  ADD COLUMN IF NOT EXISTS lead_state text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS client_ip_address text,
  ADD COLUMN IF NOT EXISTS client_user_agent text;

CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL,
  agendamento_id uuid,
  venda_id uuid,
  status text NOT NULL DEFAULT 'pending',
  response_code integer,
  response_body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.meta_capi_events TO service_role;
ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_capi_events managers read" ON public.meta_capi_events;
CREATE POLICY "meta_capi_events managers read"
ON public.meta_capi_events FOR SELECT TO authenticated
USING (public.is_manager());

DROP TRIGGER IF EXISTS trg_meta_capi_events_updated_at ON public.meta_capi_events;
CREATE TRIGGER trg_meta_capi_events_updated_at
BEFORE UPDATE ON public.meta_capi_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.notify_meta_capi(_event_name text, _agendamento_id uuid, _venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url TEXT := 'https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/meta-capi-forward';
  _anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnljY2poc3hjZ2dtZ3VwdnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjk0MjcsImV4cCI6MjA4OTcwNTQyN30.oMrALsWvEwRBZT9pNkrNNxWtvQOl5eRjsWruiWP84Dc';
BEGIN
  PERFORM net.http_post(
    url := _url,
    body := jsonb_build_object(
      'event_name', _event_name,
      'agendamento_id', _agendamento_id,
      'venda_id', _venda_id
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon,
      'apikey', _anon
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_meta_capi(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_meta_capi_reuniao_realizada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL
     AND NEW.status = 'realizada'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.notify_meta_capi('ReuniaoRealizada', NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_reuniao ON public.agendamentos;
CREATE TRIGGER trg_meta_capi_reuniao
AFTER INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_reuniao_realizada();

CREATE OR REPLACE FUNCTION public.trg_meta_capi_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.vendeu IS TRUE
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.vendeu, false) IS DISTINCT FROM true) THEN
    PERFORM public.notify_meta_capi('Purchase', NEW.agendamento_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_capi_venda ON public.vendas;
CREATE TRIGGER trg_meta_capi_venda
AFTER INSERT OR UPDATE ON public.vendas
FOR EACH ROW EXECUTE FUNCTION public.trg_meta_capi_purchase();