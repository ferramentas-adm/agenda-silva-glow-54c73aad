
-- ─── Fase 3: RPCs de agregação para dashboards ───────────────────────
-- Todas as funções são SECURITY INVOKER (respeitam RLS do usuário autenticado)
-- e STABLE (Postgres pode cachear resultado dentro da query).

-- 1) Tendência SDR (criadas / realizadas por dia) ────────────────────
CREATE OR REPLACE FUNCTION public.dashboard_trend_sdr(_window_days int)
RETURNS TABLE(day date, criadas int, realizadas int)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      (current_date - GREATEST(_window_days, 1) + 1) AS start_day,
      current_date AS end_day
  ),
  window_days AS (
    SELECT gs::date AS day
    FROM bounds b, generate_series(b.start_day, b.end_day, interval '1 day') gs
  ),
  sdr_ids AS (
    SELECT user_id FROM public.user_roles WHERE role = 'sdr'
  ),
  criadas AS (
    SELECT ((a.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS day,
           count(*)::int AS n
    FROM public.agendamentos a, bounds b
    WHERE a.deleted_at IS NULL
      AND a.original_agendamento_id IS NULL
      AND coalesce(a.sdr_responsavel_id, a.created_by) IN (SELECT user_id FROM sdr_ids)
      AND a.created_at >= (b.start_day::text || ' 00:00:00-03')::timestamptz
      AND a.created_at <  ((b.end_day + 1)::text || ' 00:00:00-03')::timestamptz
    GROUP BY 1
  ),
  realizadas AS (
    SELECT a.scheduled_date AS day, count(*)::int AS n
    FROM public.agendamentos a, bounds b
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND coalesce(a.sdr_responsavel_id, a.created_by) IN (SELECT user_id FROM sdr_ids)
      AND a.scheduled_date BETWEEN b.start_day AND b.end_day
    GROUP BY 1
  )
  SELECT w.day, coalesce(c.n, 0), coalesce(r.n, 0)
  FROM window_days w
  LEFT JOIN criadas c ON c.day = w.day
  LEFT JOIN realizadas r ON r.day = w.day
  ORDER BY w.day;
$$;

REVOKE ALL ON FUNCTION public.dashboard_trend_sdr(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_trend_sdr(int) TO authenticated, service_role;


-- 2) Tendência de vendas (realizadas / vendas / faturamento por dia) ─
CREATE OR REPLACE FUNCTION public.dashboard_trend_vendas(_window_days int, _closer_id uuid DEFAULT NULL)
RETURNS TABLE(day date, realizadas int, vendas int, faturamento numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      (current_date - GREATEST(_window_days, 1) + 1) AS start_day,
      current_date AS end_day
  ),
  window_days AS (
    SELECT gs::date AS day
    FROM bounds b, generate_series(b.start_day, b.end_day, interval '1 day') gs
  ),
  ags AS (
    SELECT a.id, a.scheduled_date
    FROM public.agendamentos a, bounds b
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND a.scheduled_date BETWEEN b.start_day AND b.end_day
      AND (_closer_id IS NULL OR a.closer_id = _closer_id)
  ),
  ven_latest AS (
    SELECT DISTINCT ON (v.agendamento_id)
      v.agendamento_id,
      v.vendeu,
      coalesce(v.valor, 0) AS valor,
      lower(trim(coalesce(v.motivo_nao_fechamento, ''))) AS motivo
    FROM public.vendas v
    WHERE v.agendamento_id IN (SELECT id FROM ags)
    ORDER BY v.agendamento_id, v.created_at DESC
  ),
  filtered AS (
    SELECT a.scheduled_date AS day,
           (v.vendeu IS TRUE) AS vendeu,
           coalesce(v.valor, 0) AS valor
    FROM ags a
    LEFT JOIN ven_latest v ON v.agendamento_id = a.id
    WHERE NOT (
      v.agendamento_id IS NOT NULL
      AND v.vendeu IS NOT TRUE
      AND v.motivo IN ('call interompida', 'call interrompida')
    )
  ),
  agg AS (
    SELECT day,
           count(*)::int AS realizadas,
           count(*) FILTER (WHERE vendeu)::int AS vendas,
           coalesce(sum(valor) FILTER (WHERE vendeu), 0)::numeric AS faturamento
    FROM filtered
    GROUP BY day
  )
  SELECT w.day,
         coalesce(a.realizadas, 0),
         coalesce(a.vendas, 0),
         coalesce(a.faturamento, 0)
  FROM window_days w
  LEFT JOIN agg a ON a.day = w.day
  ORDER BY w.day;
$$;

REVOKE ALL ON FUNCTION public.dashboard_trend_vendas(int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_trend_vendas(int, uuid) TO authenticated, service_role;


-- 3) Agendas por canal (agregado + ids para drilldown) ───────────────
CREATE OR REPLACE FUNCTION public.dashboard_agendas_por_canal(_from date, _to date)
RETURNS TABLE(
  channel text,
  qtd_scheduled int,
  qtd_scheduled_realizada int,
  qtd_created int,
  qtd_created_realizada int,
  ids_scheduled uuid[],
  ids_scheduled_realizada uuid[],
  ids_created uuid[],
  ids_created_realizada uuid[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scheduled AS (
    SELECT coalesce(channel_type, 'Sem canal') AS ch, id, status
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND scheduled_date BETWEEN _from AND _to
  ),
  created AS (
    SELECT coalesce(channel_type, 'Sem canal') AS ch, id, status
    FROM public.agendamentos
    WHERE deleted_at IS NULL
      AND created_at >= (_from::text || ' 00:00:00-03')::timestamptz
      AND created_at <= (_to::text   || ' 23:59:59-03')::timestamptz
  ),
  sched_agg AS (
    SELECT ch,
           count(*)::int AS qtd,
           count(*) FILTER (WHERE status = 'realizada')::int AS qtd_real,
           array_agg(id) AS ids,
           coalesce(array_agg(id) FILTER (WHERE status = 'realizada'), '{}') AS ids_real
    FROM scheduled GROUP BY ch
  ),
  created_agg AS (
    SELECT ch,
           count(*)::int AS qtd,
           count(*) FILTER (WHERE status = 'realizada')::int AS qtd_real,
           array_agg(id) AS ids,
           coalesce(array_agg(id) FILTER (WHERE status = 'realizada'), '{}') AS ids_real
    FROM created GROUP BY ch
  ),
  channels AS (
    SELECT ch FROM sched_agg UNION SELECT ch FROM created_agg
  )
  SELECT
    c.ch AS channel,
    coalesce(s.qtd, 0),
    coalesce(s.qtd_real, 0),
    coalesce(cr.qtd, 0),
    coalesce(cr.qtd_real, 0),
    coalesce(s.ids, '{}'),
    coalesce(s.ids_real, '{}'),
    coalesce(cr.ids, '{}'),
    coalesce(cr.ids_real, '{}')
  FROM channels c
  LEFT JOIN sched_agg s ON s.ch = c.ch
  LEFT JOIN created_agg cr ON cr.ch = c.ch;
$$;

REVOKE ALL ON FUNCTION public.dashboard_agendas_por_canal(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_agendas_por_canal(date, date) TO authenticated, service_role;
