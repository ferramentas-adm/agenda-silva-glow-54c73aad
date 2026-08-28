CREATE INDEX IF NOT EXISTS idx_agendamentos_segunda_reuniao
  ON public.agendamentos (original_agendamento_id, scheduled_date)
  WHERE meeting_reason = 'segunda_reuniao' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_agendamento_vendeu
  ON public.vendas (agendamento_id)
  WHERE vendeu IS TRUE;

CREATE OR REPLACE FUNCTION public.dashboard_conversao_period(p_from date, p_to date, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_reunioes integer, total_vendas integer, ids uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ags AS MATERIALIZED (
    SELECT a.id,
           a.scheduled_date,
           regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND COALESCE(a.is_venda_avulsa, false) = false
      AND COALESCE(a.meeting_reason, '') <> 'segunda_reuniao'
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
  ),
  latest_venda AS MATERIALIZED (
    SELECT DISTINCT ON (v.agendamento_id)
      v.agendamento_id,
      v.vendeu,
      v.closed_at,
      lower(trim(coalesce(v.motivo_nao_fechamento, ''))) AS motivo
    FROM public.vendas v
    WHERE v.agendamento_id IN (SELECT id FROM ags)
    ORDER BY v.agendamento_id, v.created_at DESC
  ),
  -- Segundas reuniões que fecharam venda. Materializada: antes esta CTE era
  -- inlinada e re-executada uma vez por reunião do período (varredura completa
  -- de `vendas` a cada linha), o que fazia a função levar mais de 13s em um mês.
  segundas AS MATERIALIZED (
    SELECT s.original_agendamento_id,
           s.scheduled_date,
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
  -- Vínculo direto (original_agendamento_id) pré-agregado -> semi-junção.
  seg_direct AS MATERIALIZED (
    SELECT DISTINCT original_agendamento_id AS id
    FROM segundas
    WHERE original_agendamento_id IS NOT NULL
  ),
  -- Vínculo por telefone: basta existir uma 2ª reunião com data >= a da call,
  -- então guardamos a data máxima por telefone.
  seg_phone AS MATERIALIZED (
    SELECT phone, max(scheduled_date) AS last_date
    FROM segundas
    WHERE original_agendamento_id IS NULL
      AND phone <> ''
    GROUP BY phone
  ),
  validos AS (
    SELECT a.id,
           (
             (
               coalesce(lv.vendeu, false)
               AND (lv.closed_at IS NULL OR lv.closed_at BETWEEN p_from AND p_to)
             )
             OR sd.id IS NOT NULL
             OR (sp.phone IS NOT NULL AND a.scheduled_date <= sp.last_date)
           ) AS vendeu
    FROM ags a
    LEFT JOIN latest_venda lv ON lv.agendamento_id = a.id
    LEFT JOIN seg_direct sd ON sd.id = a.id
    LEFT JOIN seg_phone sp ON a.phone <> '' AND sp.phone = a.phone
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

GRANT EXECUTE ON FUNCTION public.dashboard_conversao_period(date, date, uuid) TO authenticated, service_role;