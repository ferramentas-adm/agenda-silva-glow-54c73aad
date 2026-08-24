ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS closer_returned_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS closer_return_reason TEXT;