CREATE TABLE public.datacrazy_sales_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  agendamento_id uuid,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_http_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT datacrazy_sales_sync_queue_status_check CHECK (status IN ('pending', 'sent')),
  CONSTRAINT datacrazy_sales_sync_queue_attempts_check CHECK (attempts >= 0)
);

GRANT ALL ON public.datacrazy_sales_sync_queue TO service_role;

ALTER TABLE public.datacrazy_sales_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX datacrazy_sales_sync_queue_status_created_idx
ON public.datacrazy_sales_sync_queue (status, created_at);

CREATE INDEX datacrazy_sales_sync_queue_agendamento_idx
ON public.datacrazy_sales_sync_queue (agendamento_id);

CREATE TRIGGER update_datacrazy_sales_sync_queue_updated_at
BEFORE UPDATE ON public.datacrazy_sales_sync_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();