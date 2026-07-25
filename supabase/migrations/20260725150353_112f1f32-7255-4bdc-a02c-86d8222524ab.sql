CREATE OR REPLACE FUNCTION public.dashboard_conversao_period(p_from date, p_to date, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_reunioes integer, total_vendas integer, ids uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ags AS (
    SELECT a.id,
           regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND COALESCE(a.is_venda_avulsa, false) = false
      AND COALESCE(a.meeting_reason, '') <> 'segunda_reuniao'
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
  -- Vendas fechadas em agendamentos de 2a reuniao: atribuidas a 1a call
  segundas AS (
    SELECT s.id,
           s.original_agendamento_id,
           regexp_replace(COALESCE(s.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos s
    WHERE s.deleted_at IS NULL
      AND s.meeting_reason = 'segunda_reuniao'
      AND COALESCE(s.is_venda_avulsa, false) = false
      AND EXISTS (
        SELECT 1 FROM public.vendas v
        WHERE v.agendamento_id = s.id AND v.vendeu IS TRUE
      )
  ),
  validos AS (
    SELECT a.id,
           (
             coalesce(lv.vendeu, false)
             OR EXISTS (
               SELECT 1 FROM segundas sg
               WHERE sg.original_agendamento_id = a.id
                  OR (a.phone <> '' AND sg.phone = a.phone)
             )
           ) AS vendeu
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
$function$;