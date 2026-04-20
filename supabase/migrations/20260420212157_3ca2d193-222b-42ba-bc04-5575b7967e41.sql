ALTER TABLE public.closer_blocks
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_weekday smallint;

-- Index para buscas por (closer, weekday) quando há recorrência
CREATE INDEX IF NOT EXISTS idx_closer_blocks_recurring
  ON public.closer_blocks (closer_id, recurrence_weekday)
  WHERE is_recurring = true;

COMMENT ON COLUMN public.closer_blocks.is_recurring IS 'Se true, o bloqueio se repete toda semana no recurrence_weekday.';
COMMENT ON COLUMN public.closer_blocks.recurrence_weekday IS '0=Domingo, 1=Segunda, ..., 6=Sábado. Usado apenas se is_recurring=true.';