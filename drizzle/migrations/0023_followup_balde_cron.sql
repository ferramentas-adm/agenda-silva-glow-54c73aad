CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('followup-balde-virada');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'followup-balde-virada',
  '1 3 * * *',
  $$SELECT public.expirar_follow_ups_para_balde();$$
);