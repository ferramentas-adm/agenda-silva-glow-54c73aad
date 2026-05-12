ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS sdr_handoff_at    timestamptz,
  ADD COLUMN IF NOT EXISTS closer_handoff_at timestamptz;