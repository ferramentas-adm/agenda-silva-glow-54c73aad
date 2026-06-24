ALTER TABLE public.agendamentos DISABLE TRIGGER USER;
UPDATE public.agendamentos
SET deleted_at = now(),
    deletion_reason = 'Closer/SDR não está mais na empresa (André Lucchesi)'
WHERE id IN (
  '67b91efb-aa97-4a2c-b357-bf1067433ed0',
  '525cb639-6864-42af-ade7-5cabfbd52c64',
  '7bc7151b-869e-48c3-a377-d6d125be79f1'
);
ALTER TABLE public.agendamentos ENABLE TRIGGER USER;