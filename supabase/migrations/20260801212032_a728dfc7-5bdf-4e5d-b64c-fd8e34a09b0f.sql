ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS venda_origem text;

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_venda_origem_check
  CHECK (venda_origem IS NULL OR venda_origem IN ('primeira_call','follow_up'));