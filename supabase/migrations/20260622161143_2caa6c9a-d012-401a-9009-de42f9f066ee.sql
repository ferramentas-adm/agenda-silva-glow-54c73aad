ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS sdr_error boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sdr_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS sdr_error_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_sdr_error
  ON public.agendamentos(sdr_error) WHERE sdr_error = true;