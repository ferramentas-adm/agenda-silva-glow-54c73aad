DO $migration$
DECLARE
  fn_sql text;
BEGIN
  SELECT pg_get_functiondef('public.notify_status_change_webhook()'::regprocedure) INTO fn_sql;
  fn_sql := replace(fn_sql, ':00-03:00', ':00');
  IF position('scheduled_timezone' in fn_sql) = 0 THEN
    fn_sql := replace(
      fn_sql,
      $old$'scheduled_datetime', _scheduled_iso,$old$,
      $new$'scheduled_datetime', _scheduled_iso, 'scheduled_date', NEW.scheduled_date, 'scheduled_time', left(NEW.scheduled_time, 5), 'scheduled_timezone', 'America/Sao_Paulo',$new$
    );
  END IF;
  EXECUTE fn_sql;

  SELECT pg_get_functiondef('public.reassign_agendamento_closer_for_result(uuid,uuid)'::regprocedure) INTO fn_sql;
  fn_sql := replace(fn_sql, ':00-03:00', ':00');
  IF position('scheduled_timezone' in fn_sql) = 0 THEN
    fn_sql := replace(
      fn_sql,
      $old$'scheduled_datetime', _scheduled_iso,$old$,
      $new$'scheduled_datetime', _scheduled_iso, 'scheduled_date', _ag.scheduled_date, 'scheduled_time', left(_ag.scheduled_time, 5), 'scheduled_timezone', 'America/Sao_Paulo',$new$
    );
  END IF;
  EXECUTE fn_sql;
END
$migration$;