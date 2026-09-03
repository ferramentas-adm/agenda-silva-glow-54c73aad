CREATE TABLE public.venda_complementos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  valor numeric NOT NULL,
  data_pagamento date NOT NULL,
  observacoes text,
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_complementos TO authenticated;
GRANT ALL ON public.venda_complementos TO service_role;

ALTER TABLE public.venda_complementos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view venda_complementos"
  ON public.venda_complementos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert venda_complementos"
  ON public.venda_complementos FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_apresentador() AND criado_por = (SELECT auth.uid()));

CREATE POLICY "Managers can update venda_complementos"
  ON public.venda_complementos FOR UPDATE TO authenticated
  USING (public.is_manager_or_apresentador())
  WITH CHECK (public.is_manager_or_apresentador());

CREATE POLICY "Managers can delete venda_complementos"
  ON public.venda_complementos FOR DELETE TO authenticated
  USING (public.is_manager_or_apresentador());

CREATE INDEX idx_venda_complementos_venda ON public.venda_complementos (venda_id);
CREATE INDEX idx_venda_complementos_data ON public.venda_complementos (data_pagamento);

CREATE TRIGGER update_venda_complementos_updated_at
  BEFORE UPDATE ON public.venda_complementos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lista paginada de vendas com saldo em aberto
CREATE OR REPLACE FUNCTION public.dashboard_saldo_residual(
  p_closer_id uuid DEFAULT NULL,
  p_order text DEFAULT 'saldo',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  venda_id uuid,
  agendamento_id uuid,
  lead_name text,
  closer_id uuid,
  closer_name text,
  produto text,
  closed_at date,
  faturado numeric,
  coletado_base numeric,
  complementos_total numeric,
  coletado_acumulado numeric,
  saldo numeric,
  qtd_complementos integer,
  is_venda_avulsa boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_saldo_residual(uuid, text, integer, integer) TO authenticated;

-- Totais gerais de saldo residual
CREATE OR REPLACE FUNCTION public.dashboard_saldo_residual_totais(p_closer_id uuid DEFAULT NULL)
RETURNS TABLE(
  total_faturado numeric,
  total_coletado_acumulado numeric,
  total_saldo numeric,
  qtd_vendas integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
  )
  SELECT
    COALESCE(SUM(faturado), 0),
    COALESCE(SUM(coletado), 0),
    COALESCE(SUM(faturado - coletado), 0),
    COUNT(*)::integer
  FROM base
  WHERE (faturado - coletado) > 0
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_saldo_residual_totais(uuid) TO authenticated;

-- Complementos recebidos no período (por data_pagamento)
CREATE OR REPLACE FUNCTION public.dashboard_complementos_periodo(
  p_from date,
  p_to date,
  p_closer_id uuid DEFAULT NULL
)
RETURNS TABLE(total numeric, qtd integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(x.valor), 0), COUNT(*)::integer
  FROM public.venda_complementos x
  JOIN public.vendas v ON v.id = x.venda_id
  JOIN public.agendamentos a ON a.id = v.agendamento_id
  WHERE x.data_pagamento >= p_from
    AND x.data_pagamento <= p_to
    AND a.deleted_at IS NULL
    AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_complementos_periodo(date, date, uuid) TO authenticated;