CREATE OR REPLACE FUNCTION public.dashboard_conversao_total_period(p_from date, p_to date, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_reunioes integer, total_vendas integer, ids uuid[])
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH ags AS MATERIALIZED (
    SELECT a.id, a.scheduled_date, regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL AND a.status = 'realizada'
      AND COALESCE(a.is_venda_avulsa, false) = false
      AND COALESCE(a.meeting_reason, '') <> 'segunda_reuniao'
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
      AND (NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (SELECT 1 FROM public.vendas vd WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0))
  ),
  latest_venda AS MATERIALIZED (
    SELECT DISTINCT ON (v.agendamento_id) v.agendamento_id, v.vendeu,
      lower(trim(coalesce(v.motivo_nao_fechamento, ''))) AS motivo
    FROM public.vendas v WHERE v.agendamento_id IN (SELECT id FROM ags)
    ORDER BY v.agendamento_id, v.created_at DESC
  ),
  segundas AS MATERIALIZED (
    SELECT s.original_agendamento_id, s.scheduled_date, regexp_replace(COALESCE(s.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos s
    WHERE s.deleted_at IS NULL AND s.meeting_reason = 'segunda_reuniao'
      AND COALESCE(s.is_venda_avulsa, false) = false
      AND EXISTS (SELECT 1 FROM public.vendas v WHERE v.agendamento_id = s.id AND v.vendeu IS TRUE)
  ),
  seg_direct AS MATERIALIZED (SELECT DISTINCT original_agendamento_id AS id FROM segundas WHERE original_agendamento_id IS NOT NULL),
  seg_phone AS MATERIALIZED (SELECT phone, max(scheduled_date) AS last_date FROM segundas WHERE original_agendamento_id IS NULL AND phone <> '' GROUP BY phone),
  validos AS (
    SELECT a.id,
      (coalesce(lv.vendeu, false) OR sd.id IS NOT NULL OR (sp.phone IS NOT NULL AND a.scheduled_date <= sp.last_date)) AS vendeu
    FROM ags a
    LEFT JOIN latest_venda lv ON lv.agendamento_id = a.id
    LEFT JOIN seg_direct sd ON sd.id = a.id
    LEFT JOIN seg_phone sp ON a.phone <> '' AND sp.phone = a.phone
    WHERE NOT (lv.vendeu IS NOT NULL AND lv.vendeu = false AND (
      lv.motivo IN ('call interompida', 'call interrompida')
      OR (lv.motivo IN ('cliente precisou sair', 'client precisou sair') AND a.scheduled_date >= DATE '2026-10-01')))
  )
  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE vendeu)::int, COALESCE(array_agg(id) FILTER (WHERE vendeu), ARRAY[]::uuid[])
  FROM validos;
$function$;
GRANT EXECUTE ON FUNCTION public.dashboard_conversao_total_period(date, date, uuid) TO authenticated;