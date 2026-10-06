CREATE TABLE public.threec_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  kind text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'running',
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  skipped_future integer NOT NULL DEFAULT 0,
  skipped_invalid integer NOT NULL DEFAULT 0,
  skipped_duplicate integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  lease_until timestamptz,
  triggered_by uuid,
  triggered_by_name text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.threec_runs TO authenticated;
GRANT ALL ON public.threec_runs TO service_role;
ALTER TABLE public.threec_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read threec runs" ON public.threec_runs FOR SELECT TO authenticated USING (public.is_manager());

CREATE TABLE public.threec_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.threec_runs(id) ON DELETE CASCADE,
  agendamento_id uuid,
  lead_name text,
  telefone text,
  result text NOT NULL,
  status_code integer,
  response text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX threec_run_items_run_idx ON public.threec_run_items(run_id);
GRANT SELECT ON public.threec_run_items TO authenticated;
GRANT ALL ON public.threec_run_items TO service_role;
ALTER TABLE public.threec_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read threec items" ON public.threec_run_items FOR SELECT TO authenticated USING (public.is_manager());

-- Idempotência: um mesmo telefone nunca é enviado duas vezes
CREATE TABLE public.threec_sent_phones (
  telefone text PRIMARY KEY,
  agendamento_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.threec_sent_phones TO authenticated;
GRANT ALL ON public.threec_sent_phones TO service_role;
ALTER TABLE public.threec_sent_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read threec sent" ON public.threec_sent_phones FOR SELECT TO authenticated USING (public.is_manager());