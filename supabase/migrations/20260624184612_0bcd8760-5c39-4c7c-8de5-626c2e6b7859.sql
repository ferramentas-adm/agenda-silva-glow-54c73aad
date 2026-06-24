ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS sdr_error_outcome TEXT CHECK (sdr_error_outcome IN ('confirmed','dismissed'));
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS sdr_error_outcome TEXT CHECK (sdr_error_outcome IN ('confirmed','dismissed'));

-- Backfill: registros já revisados são considerados "confirmed".
UPDATE public.agendamentos SET sdr_error_outcome = 'confirmed' WHERE sdr_error_reviewed_at IS NOT NULL AND sdr_error_outcome IS NULL;
UPDATE public.vendas SET sdr_error_outcome = 'confirmed' WHERE sdr_error_reviewed_at IS NOT NULL AND sdr_error_outcome IS NULL;