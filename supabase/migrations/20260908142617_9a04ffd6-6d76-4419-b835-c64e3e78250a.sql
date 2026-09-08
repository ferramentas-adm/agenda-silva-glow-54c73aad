ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_booking_channel_check;

CREATE OR REPLACE FUNCTION public.dashboard_agendamentos_por_booking_channel(_from date, _to date, _base text DEFAULT 'criacao')
RETURNS TABLE(channel text, qtd_created integer, qtd_realizada integer, qtd_vendas integer, ids_created uuid[], ids_realizada uuid[], ids_vendas uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT a.id, a.booking_channel, a.status
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.booking_channel IS NOT NULL
      AND (
        CASE WHEN _base = 'reuniao'
          THEN a.scheduled_date
          ELSE ((a.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
        END
      ) BETWEEN _from AND _to
  ), lab AS (
    SELECT b.id,
      CASE b.booking_channel
        WHEN 'whatsapp_crm' THEN 'WhatsApp (CRM)'
        WHEN 'ligacao_api4com' THEN 'Ligação API4COM'
        ELSE b.booking_channel
      END AS channel,
      b.status,
      EXISTS (SELECT 1 FROM public.vendas v WHERE v.agendamento_id = b.id AND v.vendeu) AS vendeu
    FROM base b
  )
  SELECT l.channel,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE l.status = 'realizada')::int,
    COUNT(*) FILTER (WHERE l.vendeu)::int,
    ARRAY_AGG(l.id),
    ARRAY_REMOVE(ARRAY_AGG(CASE WHEN l.status = 'realizada' THEN l.id END), NULL),
    ARRAY_REMOVE(ARRAY_AGG(CASE WHEN l.vendeu THEN l.id END), NULL)
  FROM lab l
  GROUP BY l.channel
  ORDER BY l.channel;
$$;

REVOKE ALL ON FUNCTION public.dashboard_agendamentos_por_booking_channel(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_agendamentos_por_booking_channel(date, date, text) TO authenticated;