
CREATE TABLE public.closer_error_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agendamento_id UUID NOT NULL UNIQUE REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  closer_id UUID REFERENCES public.closers(id) ON DELETE SET NULL,
  classification TEXT NOT NULL CHECK (classification IN ('closer_error','acerto')),
  error_description TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  feedback_given BOOLEAN NOT NULL DEFAULT FALSE,
  feedback_by UUID,
  feedback_at TIMESTAMPTZ,
  feedback_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_error_reviews TO authenticated;
GRANT ALL ON public.closer_error_reviews TO service_role;

ALTER TABLE public.closer_error_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view closer error reviews"
  ON public.closer_error_reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Gestor can insert closer error reviews"
  ON public.closer_error_reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor and moderador can update closer error reviews"
  ON public.closer_error_reviews FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'moderador'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'moderador'::app_role)
  );

CREATE POLICY "Gestor can delete closer error reviews"
  ON public.closer_error_reviews FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER update_closer_error_reviews_updated_at
  BEFORE UPDATE ON public.closer_error_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_closer_error_reviews_closer ON public.closer_error_reviews(closer_id);
CREATE INDEX idx_closer_error_reviews_classification ON public.closer_error_reviews(classification);
CREATE INDEX idx_closer_error_reviews_feedback ON public.closer_error_reviews(feedback_given);
