CREATE OR REPLACE FUNCTION public.lead_display_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      btrim(
        regexp_replace(
          regexp_replace(COALESCE(_name, ''), '^[^[:alpha:]]+', ''),
          '\s+', ' ', 'g'
        )
      ),
      ''
    ),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION public.lead_first_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT split_part(public.lead_display_name(_name), ' ', 1)
$$;

DO $migration$
DECLARE
  fn_sql text;
BEGIN
  SELECT pg_get_functiondef('public.notify_status_change_webhook()'::regprocedure) INTO fn_sql;
  IF position('lead_first_name' in fn_sql) = 0 THEN
    fn_sql := replace(
      fn_sql,
      $old$'lead_name', NEW.lead_name,$old$,
      $new$'lead_name', public.lead_display_name(NEW.lead_name), 'lead_first_name', public.lead_first_name(NEW.lead_name),$new$
    );
    EXECUTE fn_sql;
  END IF;

  SELECT pg_get_functiondef('public.reassign_agendamento_closer_for_result(uuid,uuid)'::regprocedure) INTO fn_sql;
  IF position('lead_first_name' in fn_sql) = 0 THEN
    fn_sql := replace(
      fn_sql,
      $old$'lead_name', _ag.lead_name,$old$,
      $new$'lead_name', public.lead_display_name(_ag.lead_name), 'lead_first_name', public.lead_first_name(_ag.lead_name),$new$
    );
    EXECUTE fn_sql;
  END IF;
END
$migration$;