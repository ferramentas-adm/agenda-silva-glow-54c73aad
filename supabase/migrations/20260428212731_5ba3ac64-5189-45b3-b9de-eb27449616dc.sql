-- Adicionar colunas para receber respostas individuais do formulário (1 lead = 1 linha)
ALTER TABLE public.lead_metrics
  ADD COLUMN IF NOT EXISTS lead_nome text,
  ADD COLUMN IF NOT EXISTS lead_email text,
  ADD COLUMN IF NOT EXISTS lead_telefone text,
  ADD COLUMN IF NOT EXISTS tem_empresa boolean,
  ADD COLUMN IF NOT EXISTS faturamento text,
  ADD COLUMN IF NOT EXISTS renda text,
  ADD COLUMN IF NOT EXISTS classificacao text;

-- Índice para acelerar contagens por classificação no dashboard
CREATE INDEX IF NOT EXISTS idx_lead_metrics_classificacao
  ON public.lead_metrics (classificacao, data_referencia DESC);

CREATE INDEX IF NOT EXISTS idx_lead_metrics_data_referencia
  ON public.lead_metrics (data_referencia DESC);