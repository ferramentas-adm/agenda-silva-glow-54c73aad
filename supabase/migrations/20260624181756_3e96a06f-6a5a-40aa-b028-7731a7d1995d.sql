
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS sdr_error_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sdr_error_reviewed_by UUID;

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS sdr_error_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sdr_error_reviewed_by UUID;
