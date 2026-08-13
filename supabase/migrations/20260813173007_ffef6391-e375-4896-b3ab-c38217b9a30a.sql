ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS vendeu_closer boolean,
  ADD COLUMN IF NOT EXISTS status_antes_venda appointment_status;