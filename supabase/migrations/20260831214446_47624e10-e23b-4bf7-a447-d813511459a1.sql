-- Exceções pontuais de bloqueios recorrentes
CREATE TABLE public.closer_block_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  block_id uuid NOT NULL REFERENCES public.closer_blocks(id) ON DELETE CASCADE,
  closer_id uuid NOT NULL REFERENCES public.closers(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_block_exceptions TO authenticated;
GRANT ALL ON public.closer_block_exceptions TO service_role;

ALTER TABLE public.closer_block_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem excecoes de bloqueio"
  ON public.closer_block_exceptions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestores gerenciam excecoes de bloqueio"
  ON public.closer_block_exceptions FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE INDEX idx_closer_block_exceptions_lookup
  ON public.closer_block_exceptions (exception_date, closer_id);

-- Histórico de liberações (com snapshot para desfazer)
CREATE TABLE public.closer_block_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closer_id uuid NOT NULL REFERENCES public.closers(id) ON DELETE CASCADE,
  release_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  original_block_type text,
  original_description text,
  original_block jsonb NOT NULL DEFAULT '{}'::jsonb,
  exception_id uuid REFERENCES public.closer_block_exceptions(id) ON DELETE SET NULL,
  released_by uuid,
  released_by_name text,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_block_releases TO authenticated;
GRANT ALL ON public.closer_block_releases TO service_role;

ALTER TABLE public.closer_block_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem liberacoes"
  ON public.closer_block_releases FOR SELECT TO authenticated USING (true);

CREATE POLICY "Gestores gerenciam liberacoes"
  ON public.closer_block_releases FOR ALL TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE INDEX idx_closer_block_releases_recent
  ON public.closer_block_releases (created_at DESC);