-- Add new enum values
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'no_show';
ALTER TYPE appointment_status ADD VALUE IF NOT EXISTS 'nao_confirmada';

-- Change default status to 'confirmada'
ALTER TABLE agendamentos ALTER COLUMN status SET DEFAULT 'confirmada'::appointment_status;

-- Update any existing 'pendente' records to 'confirmada'
UPDATE agendamentos SET status = 'confirmada' WHERE status = 'pendente';
