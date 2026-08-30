CREATE TABLE public.crm_daily_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date date NOT NULL,
  kind text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  forced boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lease_until timestamptz,
  triggered_by uuid,
  triggered_by_name text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_daily_runs_date ON public.crm_daily_runs (run_date DESC, started_at DESC);
CREATE INDEX idx_crm_daily_runs_status ON public.crm_daily_runs (status);

CREATE TABLE public.crm_daily_run_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.crm_daily_runs(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  venda_id uuid NOT NULL,
  agendamento_id uuid,
  lead_name text,
  lead_phone text,
  closer_name text,
  valor numeric,
  ok boolean NOT NULL DEFAULT false,
  status_code integer,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, venda_id)
);

CREATE INDEX idx_crm_daily_items_run ON public.crm_daily_run_items (run_id);
CREATE INDEX idx_crm_daily_items_date_ok ON public.crm_daily_run_items (run_date, ok);

GRANT SELECT ON public.crm_daily_runs TO authenticated;
GRANT ALL ON public.crm_daily_runs TO service_role;
GRANT SELECT ON public.crm_daily_run_items TO authenticated;
GRANT ALL ON public.crm_daily_run_items TO service_role;

ALTER TABLE public.crm_daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_daily_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view daily runs"
ON public.crm_daily_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor')
  OR public.has_role(auth.uid(), 'moderador')
  OR public.has_role(auth.uid(), 'supervisor')
);

CREATE POLICY "Managers can view daily run items"
ON public.crm_daily_run_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor')
  OR public.has_role(auth.uid(), 'moderador')
  OR public.has_role(auth.uid(), 'supervisor')
);