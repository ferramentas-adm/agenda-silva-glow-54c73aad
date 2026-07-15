CREATE TABLE public.lead_ai_analysis (
  agendamento_id uuid PRIMARY KEY REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lead_ai_analysis TO authenticated;
GRANT ALL ON public.lead_ai_analysis TO service_role;

ALTER TABLE public.lead_ai_analysis ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado que possa ver o agendamento pode ver a análise.
CREATE POLICY "Read lead_ai_analysis via agendamento visibility"
  ON public.lead_ai_analysis
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.id = lead_ai_analysis.agendamento_id
    )
  );

-- Escrita: exclusiva do service_role (edge function).
CREATE TRIGGER trg_lead_ai_analysis_updated_at
  BEFORE UPDATE ON public.lead_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();