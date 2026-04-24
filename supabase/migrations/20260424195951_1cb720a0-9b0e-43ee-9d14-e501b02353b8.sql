ALTER TABLE public.agendamentos 
  ALTER COLUMN status SET DEFAULT 'agendada'::appointment_status;