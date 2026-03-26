
-- Add 'moderador' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderador';

-- Create closer_blocks table for personal commitments
CREATE TABLE public.closer_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id uuid NOT NULL REFERENCES public.closers(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  block_type text NOT NULL DEFAULT 'pessoal',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.closer_blocks ENABLE ROW LEVEL SECURITY;

-- Closers can manage their own blocks (matched by email)
CREATE POLICY "Closers can view own blocks" ON public.closer_blocks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Closers can insert own blocks" ON public.closer_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())
    OR has_role(auth.uid(), 'gestor'::app_role)
  );

CREATE POLICY "Closers can delete own blocks" ON public.closer_blocks
  FOR DELETE TO authenticated
  USING (
    closer_id IN (SELECT c.id FROM public.closers c WHERE c.email = auth.email())
    OR has_role(auth.uid(), 'gestor'::app_role)
  );
