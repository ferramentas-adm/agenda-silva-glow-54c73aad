
ALTER TABLE public.agendamentos ALTER COLUMN closer_id DROP NOT NULL;

ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_closer_id_fkey;

ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_closer_id_fkey 
  FOREIGN KEY (closer_id) REFERENCES public.closers(id) ON DELETE SET NULL;
