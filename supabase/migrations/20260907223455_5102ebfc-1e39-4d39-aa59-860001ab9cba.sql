ALTER TABLE public.agendamentos
  ADD COLUMN booking_channel text;

ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_booking_channel_check
  CHECK (booking_channel IS NULL OR booking_channel IN ('whatsapp_crm','ligacao_api4com'));

CREATE INDEX IF NOT EXISTS agendamentos_booking_channel_created_at_idx
  ON public.agendamentos (booking_channel, created_at);

CREATE OR REPLACE FUNCTION public.dashboard_agendamentos_por_booking_channel(_from date, _to date, _base text DEFAULT 'criacao')
RETURNS TABLE(
  channel text,
  qtd_created integer,
  qtd_realizada integer,
  qtd_vendas integer,
  ids_created uuid[],
  ids_realizada uuid[],
  ids_vendas uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ags AS (
    SELECT a.id, a.booking_channel, a.status
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.booking_channel IS NOT NULL
      AND (
        (_base = 'reuniao' AND a.scheduled_date BETWEEN _from AND _to)
        OR (
          _base <> 'reuniao'
          AND (a.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN _from AND _to
        )
      )
  ),
  v AS (
    SELECT ve.agendamento_id
    FROM public.vendas ve
    WHERE ve.vendeu = true
  )
  SELECT
    CASE a.booking_channel
      WHEN 'whatsapp_crm' THEN 'WhatsApp (CRM)'
      WHEN 'ligacao_api4com' THEN 'Ligação API4COM'
      ELSE a.booking_channel
    END AS channel,
    COUNT(*)::integer AS qtd_created,
    COUNT(*) FILTER (WHERE a.status = 'realizada')::integer AS qtd_realizada,
    COUNT(*) FILTER (WHERE v.agendamento_id IS NOT NULL)::integer AS qtd_vendas,
    array_agg(a.id ORDER BY a.id) AS ids_created,
    COALESCE(array_agg(a.id ORDER BY a.id) FILTER (WHERE a.status = 'realizada'), '{}'::uuid[]) AS ids_realizada,
    COALESCE(array_agg(a.id ORDER BY a.id) FILTER (WHERE v.agendamento_id IS NOT NULL), '{}'::uuid[]) AS ids_vendas
  FROM ags a
  LEFT JOIN v ON v.agendamento_id = a.id
  GROUP BY 1
  ORDER BY qtd_created DESC;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_agendamentos_por_booking_channel(date, date, text) TO authenticated;