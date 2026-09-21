ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS meet_error text;

COMMENT ON COLUMN public.agendamentos.meet_error IS
  'Erro devolvido pela API do Google quando o link do Meet nao pode ser criado (inclui e-mail do closer).';