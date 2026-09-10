CREATE TABLE public.sheets_motivos_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  spreadsheet_id text NOT NULL,
  spreadsheet_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sheets_motivos_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'running',
  rows integer NOT NULL DEFAULT 0,
  month text,
  spreadsheet_url text,
  sheet_title text,
  error text,
  lease_until timestamptz,
  triggered_by uuid,
  triggered_by_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

GRANT SELECT ON public.sheets_motivos_exports TO authenticated;
GRANT SELECT ON public.sheets_motivos_runs TO authenticated;
GRANT ALL ON public.sheets_motivos_exports TO service_role;
GRANT ALL ON public.sheets_motivos_runs TO service_role;

ALTER TABLE public.sheets_motivos_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets_motivos_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores veem planilhas de motivos"
ON public.sheets_motivos_exports FOR SELECT TO authenticated
USING (public.is_manager_or_apresentador());

CREATE POLICY "Gestores veem execucoes de motivos"
ON public.sheets_motivos_runs FOR SELECT TO authenticated
USING (public.is_manager_or_apresentador());

INSERT INTO public.app_settings (key, value)
VALUES ('sheets_motivos_cron_token', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;