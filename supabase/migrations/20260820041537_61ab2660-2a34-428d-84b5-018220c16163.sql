CREATE TABLE public.chamadas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  lead_name text,
  lead_phone text NOT NULL,
  called_by uuid NOT NULL,
  caller_extension text,
  provider text NOT NULL DEFAULT 'api4com',
  provider_call_id text,
  status text NOT NULL DEFAULT 'iniciada',
  status_code text,
  status_label text,
  duration_seconds integer,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  answered_at timestamp with time zone,
  ended_at timestamp with time zone,
  audit_log_id uuid,
  raw_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.chamadas TO authenticated;
GRANT ALL ON public.chamadas TO service_role;

ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chamadas_insert_own" ON public.chamadas
FOR INSERT TO authenticated
WITH CHECK (called_by = auth.uid());

CREATE POLICY "chamadas_select_scoped" ON public.chamadas
FOR SELECT TO authenticated
USING (
  called_by = auth.uid()
  OR public.is_manager()
  OR EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.id = chamadas.agendamento_id
      AND (
        a.sdr_responsavel_id = auth.uid()
        OR a.created_by = auth.uid()
        OR a.closer_id = public.current_closer_id()
      )
  )
);

CREATE INDEX idx_chamadas_agendamento ON public.chamadas(agendamento_id);
CREATE INDEX idx_chamadas_provider_call ON public.chamadas(provider_call_id);
CREATE INDEX idx_chamadas_called_by ON public.chamadas(called_by, started_at DESC);

CREATE TRIGGER trg_chamadas_updated_at
BEFORE UPDATE ON public.chamadas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api4com_extension text;