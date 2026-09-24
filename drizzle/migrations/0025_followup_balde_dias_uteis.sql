-- Follow-ups vencidos só vão para o Balde após 2 dias ÚTEIS de tolerância.
CREATE OR REPLACE FUNCTION public.expirar_follow_ups_para_balde()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  afetados integer;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  WITH movidos AS (
    UPDATE public.vendas v
    SET follow_up_status = 'balde',
        follow_up_balde_em = now(),
        follow_up_owner_closer_id = NULL
    WHERE v.follow_up = true
      AND v.vendeu = false
      AND v.follow_up_status = 'ativo'
      AND v.follow_up_date IS NOT NULL
      AND v.follow_up_date < hoje
      AND (
        SELECT count(*)
        FROM generate_series(v.follow_up_date + 1, hoje, interval '1 day') AS d(dia)
        WHERE EXTRACT(ISODOW FROM d.dia) < 6
      ) > 2
    RETURNING v.id
  )
  SELECT count(*) INTO afetados FROM movidos;
  RETURN afetados;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expirar_follow_ups_para_balde() TO authenticated, service_role;