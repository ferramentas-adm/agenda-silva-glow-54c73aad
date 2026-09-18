ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS cancellation_note text;

COMMENT ON COLUMN public.agendamentos.cancellation_note IS 'Justificativa livre do não comparecimento/cancelamento. O motivo (cancellation_reason) aceita apenas itens da lista oficial.';