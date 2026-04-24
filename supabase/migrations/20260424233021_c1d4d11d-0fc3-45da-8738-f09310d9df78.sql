-- Adiciona coluna para armazenar o faturamento do lead na tabela de vendas
ALTER TABLE public.vendas
ADD COLUMN IF NOT EXISTS lead_revenue text;

COMMENT ON COLUMN public.vendas.lead_revenue IS 'Faixa de faturamento mensal do lead, capturada no Resultado da Reunião';