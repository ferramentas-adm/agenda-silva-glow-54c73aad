CREATE OR REPLACE FUNCTION public.dashboard_saldo_residual(p_closer_id uuid DEFAULT NULL::uuid, p_order text DEFAULT 'saldo'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_from date DEFAULT NULL::date)
 RETURNS TABLE(venda_id uuid, agendamento_id uuid, lead_name text, closer_id uuid, closer_name text, produto text, closed_at date, faturado numeric, coletado_base numeric, complementos_total numeric, coletado_acumulado numeric, saldo numeric, qtd_complementos integer, is_venda_avulsa boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      v.id AS venda_id,
      v.agendamento_id,
      a.lead_name,
      a.closer_id,
      c.name AS closer_name,
      v.produto,
      public.venda_closing_date(v.closed_at, v.updated_at) AS closed_at,
      COALESCE(v.valor_total_projeto, 0) AS faturado,
      COALESCE(v.valor, 0) AS coletado_base,
      COALESCE(cp.total, 0) AS complementos_total,
      COALESCE(cp.n, 0)::integer AS qtd_complementos,
      COALESCE(a.is_venda_avulsa, false) AS is_venda_avulsa
    FROM public.vendas v
    JOIN public.agendamentos a ON a.id = v.agendamento_id
    LEFT JOIN public.closers c ON c.id = a.closer_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(x.valor), 0) AS total, COUNT(*) AS n
      FROM public.venda_complementos x
      WHERE x.venda_id = v.id
    ) cp ON true
    WHERE v.vendeu = true
      AND a.deleted_at IS NULL
      AND COALESCE(v.valor_total_projeto, 0) > 0
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
      AND (p_from IS NULL OR public.venda_closing_date(v.closed_at, v.updated_at) >= p_from)
  )
  SELECT
    b.venda_id, b.agendamento_id, b.lead_name, b.closer_id, b.closer_name, b.produto,
    b.closed_at, b.faturado, b.coletado_base, b.complementos_total,
    (b.coletado_base + b.complementos_total) AS coletado_acumulado,
    (b.faturado - b.coletado_base - b.complementos_total) AS saldo,
    b.qtd_complementos, b.is_venda_avulsa
  FROM base b
  WHERE (b.faturado - b.coletado_base - b.complementos_total) > 0
  ORDER BY
    CASE WHEN p_order = 'antiga' THEN 0 ELSE 1 END,
    b.closed_at ASC NULLS LAST,
    (b.faturado - b.coletado_base - b.complementos_total) DESC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_saldo_residual_totais(p_closer_id uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date)
 RETURNS TABLE(total_faturado numeric, total_coletado_acumulado numeric, total_saldo numeric, qtd_vendas integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      COALESCE(v.valor_total_projeto, 0) AS faturado,
      COALESCE(v.valor, 0) + COALESCE((
        SELECT SUM(x.valor) FROM public.venda_complementos x WHERE x.venda_id = v.id
      ), 0) AS coletado
    FROM public.vendas v
    JOIN public.agendamentos a ON a.id = v.agendamento_id
    WHERE v.vendeu = true
      AND a.deleted_at IS NULL
      AND COALESCE(v.valor_total_projeto, 0) > 0
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
      AND (p_from IS NULL OR public.venda_closing_date(v.closed_at, v.updated_at) >= p_from)
  )
  SELECT
    COALESCE(SUM(faturado), 0),
    COALESCE(SUM(coletado), 0),
    COALESCE(SUM(faturado - coletado), 0),
    COUNT(*)::integer
  FROM base
  WHERE (faturado - coletado) > 0
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_saldo_residual(uuid, text, integer, integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_saldo_residual_totais(uuid, date) TO authenticated;