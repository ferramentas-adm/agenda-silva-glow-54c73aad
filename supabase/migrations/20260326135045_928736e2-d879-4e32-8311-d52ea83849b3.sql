ALTER TABLE public.agendamentos DROP CONSTRAINT agendamentos_created_by_fkey;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.agendamentos ALTER COLUMN created_by DROP NOT NULL;