-- Data efetiva de fechamento da venda (BRT)
CREATE OR REPLACE FUNCTION public.venda_closing_date(_closed_at date, _updated_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(_closed_at, (_updated_at AT TIME ZONE 'America/Sao_Paulo')::date)
$$;

GRANT EXECUTE ON FUNCTION public.venda_closing_date(date, timestamptz) TO authenticated;

-- 1) Performance por Closer: realizadas (por data da reunião) + vendas/receita (por data de fechamento)
CREATE OR REPLACE FUNCTION public.dashboard_vendas_closer_perf(
  p_from date,
  p_to date,
  p_channel text DEFAULT NULL,
  p_closer_id uuid DEFAULT NULL
)
RETURNS TABLE(closer_id uuid, realizadas integer, vendas integer, receita numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH realizadas AS (
    SELECT a.closer_id, COUNT(*)::int AS qtd
    FROM agendamentos a
    WHERE a.status = 'realizada'
      AND a.deleted_at IS NULL
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND a.closer_id IS NOT NULL
      AND (p_channel IS NULL OR a.channel_type = p_channel)
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
    GROUP BY a.closer_id
  ),
  vendidas AS (
    SELECT a.closer_id,
           COUNT(*)::int AS qtd,
           COALESCE(SUM(v.valor), 0) AS receita
    FROM vendas v
    JOIN agendamentos a ON a.id = v.agendamento_id
    WHERE v.vendeu
      AND a.deleted_at IS NULL
      AND a.closer_id IS NOT NULL
      AND public.venda_closing_date(v.closed_at, v.updated_at) BETWEEN p_from AND p_to
      AND (p_channel IS NULL OR a.channel_type = p_channel)
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
    GROUP BY a.closer_id
  )
  SELECT COALESCE(r.closer_id, s.closer_id) AS closer_id,
         COALESCE(r.qtd, 0) AS realizadas,
         COALESCE(s.qtd, 0) AS vendas,
         COALESCE(s.receita, 0) AS receita
  FROM realizadas r
  FULL OUTER JOIN vendidas s ON s.closer_id = r.closer_id
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_vendas_closer_perf(date, date, text, uuid) TO authenticated;

-- 2) KPIs do período
CREATE OR REPLACE FUNCTION public.dashboard_vendas_kpis(
  p_from date,
  p_to date,
  p_closer_id uuid DEFAULT NULL
)
RETURNS TABLE(
  vendas_calls integer,
  vendas_avulsas integer,
  coletado_calls numeric,
  coletado_avulsa numeric,
  faturado_calls numeric,
  faturado_avulsa numeric,
  vendas_primeira_call integer,
  vendas_follow integer,
  nao_fechou integer,
  ofertas_preco integer,
  vendas_sem_status_realizada integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH fechadas AS (
    SELECT v.valor,
           v.valor_total_projeto,
           v.follow_up,
           (v.segunda_reuniao OR a.meeting_reason = 'segunda_reuniao') AS is_segunda,
           COALESCE(a.is_venda_avulsa, false) AS avulsa,
           (a.status <> 'realizada') AS sem_realizada
    FROM vendas v
    JOIN agendamentos a ON a.id = v.agendamento_id
    WHERE v.vendeu
      AND a.deleted_at IS NULL
      AND public.venda_closing_date(v.closed_at, v.updated_at) BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
  ),
  perdidas AS (
    SELECT v.valor, COALESCE(a.is_venda_avulsa, false) AS avulsa
    FROM vendas v
    JOIN agendamentos a ON a.id = v.agendamento_id
    WHERE NOT v.vendeu
      AND a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
  )
  SELECT
    (SELECT COUNT(*) FROM fechadas WHERE NOT avulsa)::int,
    (SELECT COUNT(*) FROM fechadas WHERE avulsa)::int,
    (SELECT COALESCE(SUM(valor), 0) FROM fechadas WHERE NOT avulsa),
    (SELECT COALESCE(SUM(valor), 0) FROM fechadas WHERE avulsa),
    (SELECT COALESCE(SUM(COALESCE(valor_total_projeto, valor, 0)), 0) FROM fechadas WHERE NOT avulsa),
    (SELECT COALESCE(SUM(COALESCE(valor_total_projeto, valor, 0)), 0) FROM fechadas WHERE avulsa),
    (SELECT COUNT(*) FROM fechadas WHERE NOT avulsa AND NOT COALESCE(follow_up, false) AND NOT COALESCE(is_segunda, false))::int,
    (SELECT COUNT(*) FROM fechadas WHERE NOT avulsa AND (COALESCE(follow_up, false) OR COALESCE(is_segunda, false)))::int,
    (SELECT COUNT(*) FROM perdidas WHERE NOT avulsa)::int,
    (
      (SELECT COUNT(*) FROM fechadas WHERE NOT avulsa)::int
      + (SELECT COUNT(*) FROM perdidas WHERE NOT avulsa AND COALESCE(valor, 0) > 0)::int
    ),
    (SELECT COUNT(*) FROM fechadas WHERE sem_realizada)::int
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_vendas_kpis(date, date, uuid) TO authenticated;

-- 3) Motivos de não fechamento agregados
CREATE OR REPLACE FUNCTION public.dashboard_vendas_motivos(
  p_from date,
  p_to date,
  p_closer_id uuid DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_preco text DEFAULT NULL
)
RETURNS TABLE(motivo text, qtd integer, total_nao_fechou integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT v.motivo_nao_fechamento AS motivo
    FROM vendas v
    JOIN agendamentos a ON a.id = v.agendamento_id
    WHERE NOT v.vendeu
      AND a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
      AND (p_channel IS NULL OR a.channel_type = p_channel)
      AND (
        p_preco IS NULL
        OR (p_preco = 'sim' AND COALESCE(v.valor, 0) > 0)
        OR (p_preco = 'nao' AND COALESCE(v.valor, 0) = 0)
      )
  )
  SELECT motivo,
         COUNT(*)::int AS qtd,
         (SELECT COUNT(*) FROM base)::int AS total_nao_fechou
  FROM base
  WHERE motivo IS NOT NULL
  GROUP BY motivo
  ORDER BY qtd DESC
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_vendas_motivos(date, date, uuid, text, text) TO authenticated;

-- 4) Reuniões realizadas sem closer atribuído no período
CREATE OR REPLACE FUNCTION public.dashboard_vendas_realizadas_sem_closer(
  p_from date,
  p_to date
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM agendamentos a
  WHERE a.status = 'realizada'
    AND a.deleted_at IS NULL
    AND a.closer_id IS NULL
    AND a.scheduled_date BETWEEN p_from AND p_to
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_vendas_realizadas_sem_closer(date, date) TO authenticated;