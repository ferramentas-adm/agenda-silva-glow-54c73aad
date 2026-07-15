
CREATE OR REPLACE FUNCTION public.dashboard_conversao_period(
  p_from date,
  p_to date,
  p_closer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_reunioes integer,
  total_vendas integer,
  ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ags AS (
    SELECT a.id
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND COALESCE(a.is_venda_avulsa, false) = false
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
  ),
  latest_venda AS (
    SELECT DISTINCT ON (v.agendamento_id)
      v.agendamento_id,
      v.vendeu,
      lower(trim(coalesce(v.motivo_nao_fechamento, ''))) AS motivo
    FROM public.vendas v
    WHERE v.agendamento_id IN (SELECT id FROM ags)
    ORDER BY v.agendamento_id, v.created_at DESC
  ),
  validos AS (
    SELECT a.id,
           coalesce(lv.vendeu, false) AS vendeu
    FROM ags a
    LEFT JOIN latest_venda lv ON lv.agendamento_id = a.id
    WHERE NOT (
      lv.vendeu IS NOT NULL
      AND lv.vendeu = false
      AND lv.motivo IN ('call interompida', 'call interrompida')
    )
  )
  SELECT
    COUNT(*)::int AS total_reunioes,
    COUNT(*) FILTER (WHERE vendeu)::int AS total_vendas,
    COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids
  FROM validos;
$$;

REVOKE ALL ON FUNCTION public.dashboard_conversao_period(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_conversao_period(date, date, uuid) TO authenticated, service_role;
