-- Tabela de vendas vinculadas a agendamentos realizados
CREATE TABLE public.vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agendamento_id UUID NOT NULL UNIQUE REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  vendeu BOOLEAN NOT NULL,
  resumo_venda TEXT,
  valor NUMERIC(12,2),
  follow_up BOOLEAN NOT NULL DEFAULT false,
  follow_up_date DATE,
  motivo_nao_fechamento TEXT,
  observacoes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendas_agendamento ON public.vendas(agendamento_id);
CREATE INDEX idx_vendas_created_at ON public.vendas(created_at);
CREATE INDEX idx_vendas_follow_up_date ON public.vendas(follow_up_date) WHERE follow_up = true;

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ver vendas (necessário para dashboards)
CREATE POLICY "Authenticated can view vendas"
ON public.vendas FOR SELECT
TO authenticated
USING (true);

-- Closer dono do agendamento, SDR criador, gestor ou moderador podem inserir
CREATE POLICY "Allowed users can insert vendas"
ON public.vendas FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'moderador'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = agendamento_id
      AND (
        a.created_by = auth.uid()
        OR (has_role(auth.uid(), 'closer'::app_role) AND a.closer_id IN (
          SELECT c.id FROM public.closers c WHERE c.email = auth.email()
        ))
      )
    )
  )
);

-- Gestor/moderador podem atualizar; closer/sdr podem atualizar a própria venda
CREATE POLICY "Allowed users can update vendas"
ON public.vendas FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR created_by = auth.uid()
);

-- Apenas gestor pode deletar
CREATE POLICY "Gestors can delete vendas"
ON public.vendas FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER update_vendas_updated_at
BEFORE UPDATE ON public.vendas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Sementes de configuração editável (motivos de não fechamento, motivos de reunião, canais, motivos de bloqueio)
INSERT INTO public.app_settings (key, value) VALUES
  ('motivos_nao_fechamento', '["Expectativas desalinhadas","Não é o momento","Sem capacidade financeira"]'),
  ('meeting_reasons', '["Apresentação","Diagnóstico","Fechamento","Follow-up","Segunda Reunião"]'),
  ('channel_types', '["Indicação","Inbound","Orgânico","Outbound","Tráfego Pago"]'),
  ('block_reasons', '["Almoço","Compromisso pessoal","Folga","Reunião interna","Treinamento"]')
ON CONFLICT (key) DO NOTHING;