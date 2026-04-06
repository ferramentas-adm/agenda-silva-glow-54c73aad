ALTER TABLE public.agendamentos ADD COLUMN briefing_read_at timestamptz DEFAULT NULL;
ALTER TABLE public.agendamentos ADD COLUMN briefing_read_by uuid DEFAULT NULL;