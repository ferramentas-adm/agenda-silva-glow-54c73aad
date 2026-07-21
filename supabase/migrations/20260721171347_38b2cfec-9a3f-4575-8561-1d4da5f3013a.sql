ALTER TABLE public.agendamentos DISABLE TRIGGER USER;
UPDATE public.agendamentos SET deleted_at = now(), deletion_reason = 'Duplicidade — reunião realizada registrada em aedc03cc' WHERE id = 'dea2c308-8e76-4adb-93b7-71bcfa0c8228';
ALTER TABLE public.agendamentos ENABLE TRIGGER USER;