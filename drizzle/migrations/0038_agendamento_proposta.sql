ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS proposta_enviada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposta_url text,
  ADD COLUMN IF NOT EXISTS proposta_em timestamptz;