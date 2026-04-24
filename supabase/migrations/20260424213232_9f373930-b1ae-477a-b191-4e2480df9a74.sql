-- Desabilita o trigger de webhook temporariamente para evitar disparos espúrios
ALTER TABLE public.agendamentos DISABLE TRIGGER trg_agendamento_status_webhook;

UPDATE public.agendamentos
SET status = 'agendada'
WHERE id IN (
  '65ce76f5-e99e-492e-8097-3787b8bc9723',
  '32675966-af38-4437-bd58-216955cfd96d',
  'bcc28a33-282d-4444-a14d-9e14a837cf31',
  '5377a6ae-59af-4c07-9b21-d03fc3d78ffa'
);

ALTER TABLE public.agendamentos ENABLE TRIGGER trg_agendamento_status_webhook;