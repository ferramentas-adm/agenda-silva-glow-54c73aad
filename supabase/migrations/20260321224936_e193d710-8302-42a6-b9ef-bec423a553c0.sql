
-- Create appointment status enum
CREATE TYPE public.appointment_status AS ENUM ('pendente', 'confirmada', 'realizada', 'cancelada', 'reagendada');

-- Create agendamentos table
CREATE TABLE public.agendamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_name TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  closer_id UUID REFERENCES public.closers(id) NOT NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT NOT NULL,
  observation TEXT,
  status appointment_status NOT NULL DEFAULT 'pendente',
  meet_link TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  original_agendamento_id UUID REFERENCES public.agendamentos(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- Policies: all authenticated users can view agendamentos
CREATE POLICY "Authenticated users can view agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated
  USING (true);

-- SDRs and gestors can create agendamentos
CREATE POLICY "Authenticated users can create agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Authenticated users can update agendamentos
CREATE POLICY "Authenticated users can update agendamentos" ON public.agendamentos
  FOR UPDATE TO authenticated
  USING (true);

-- Add index for faster queries
CREATE INDEX idx_agendamentos_closer_date ON public.agendamentos(closer_id, scheduled_date);
CREATE INDEX idx_agendamentos_status ON public.agendamentos(status);

-- Update timestamp trigger
CREATE TRIGGER update_agendamentos_updated_at
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
