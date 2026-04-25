-- Tabela para armazenar métricas agregadas vindas de projetos externos
CREATE TABLE public.lead_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origem TEXT NOT NULL,
  evento TEXT NOT NULL,
  periodo TEXT,
  data_referencia DATE NOT NULL,
  leads_iniciados INTEGER NOT NULL DEFAULT 0,
  leads_finalizados INTEGER NOT NULL DEFAULT 0,
  taxa_conclusao NUMERIC(5,2),
  enviado_em TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas rápidas
CREATE INDEX idx_lead_metrics_data ON public.lead_metrics(data_referencia DESC);
CREATE INDEX idx_lead_metrics_origem ON public.lead_metrics(origem);
CREATE INDEX idx_lead_metrics_evento ON public.lead_metrics(evento);

-- RLS
ALTER TABLE public.lead_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lead_metrics"
ON public.lead_metrics FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can update lead_metrics"
ON public.lead_metrics FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role));

CREATE POLICY "Managers can delete lead_metrics"
ON public.lead_metrics FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role));

-- INSERT é feito pela edge function com service role (bypass RLS), nenhuma policy de INSERT para usuários.