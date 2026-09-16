-- Regra: reunião de lead desqualificado só entra nas métricas/vendas quando
-- virou venda com valor coletado (> 0). Sem valor coletado, não conta em nada.
CREATE INDEX IF NOT EXISTS idx_vendas_agendamento_vendeu_valor
  ON public.vendas (agendamento_id)
  WHERE vendeu AND COALESCE(valor, 0) > 0;

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
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
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
  seg_direct AS MATERIALIZED (
    SELECT DISTINCT original_agendamento_id AS id
    FROM segundas
    WHERE original_agendamento_id IS NOT NULL
  ),
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

CREATE OR REPLACE FUNCTION public.dashboard_vendas_kpis(p_from date, p_to date, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(vendas_calls integer, vendas_avulsas integer, coletado_calls numeric, coletado_avulsa numeric, faturado_calls numeric, faturado_avulsa numeric, vendas_primeira_call integer, vendas_follow integer, nao_fechou integer, ofertas_preco integer, vendas_sem_status_realizada integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      AND (NOT COALESCE(a.lead_desqualificado, false) OR COALESCE(v.valor, 0) > 0)
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
      AND NOT COALESCE(a.lead_desqualificado, false)
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_vendas_closer_perf(p_from date, p_to date, p_channel text DEFAULT NULL::text, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(closer_id uuid, realizadas integer, vendas integer, receita numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH realizadas AS (
    SELECT a.closer_id, COUNT(*)::int AS qtd
    FROM agendamentos a
    WHERE a.status = 'realizada'
      AND a.deleted_at IS NULL
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND a.closer_id IS NOT NULL
      AND (p_channel IS NULL OR a.channel_type = p_channel)
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
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
      AND (NOT COALESCE(a.lead_desqualificado, false) OR COALESCE(v.valor, 0) > 0)
    GROUP BY a.closer_id
  )
  SELECT COALESCE(r.closer_id, s.closer_id) AS closer_id,
         COALESCE(r.qtd, 0) AS realizadas,
         COALESCE(s.qtd, 0) AS vendas,
         COALESCE(s.receita, 0) AS receita
  FROM realizadas r
  FULL OUTER JOIN vendidas s ON s.closer_id = r.closer_id
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_vendas_motivos(p_from date, p_to date, p_closer_id uuid DEFAULT NULL::uuid, p_channel text DEFAULT NULL::text, p_preco text DEFAULT NULL::text)
 RETURNS TABLE(motivo text, qtd integer, total_nao_fechou integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      AND NOT COALESCE(a.lead_desqualificado, false)
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_vendas_realizadas_sem_closer(p_from date, p_to date)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::int
  FROM agendamentos a
  WHERE a.status = 'realizada'
    AND a.deleted_at IS NULL
    AND a.closer_id IS NULL
    AND a.scheduled_date BETWEEN p_from AND p_to
    AND (
      NOT COALESCE(a.lead_desqualificado, false)
      OR EXISTS (
        SELECT 1 FROM public.vendas vd
        WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_agendas_por_canal(_from date, _to date)
 RETURNS TABLE(channel text, qtd_scheduled integer, qtd_scheduled_realizada integer, qtd_created integer, qtd_created_realizada integer, ids_scheduled uuid[], ids_scheduled_realizada uuid[], ids_created uuid[], ids_created_realizada uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH scheduled AS (
    SELECT coalesce(a.channel_type, 'Sem canal') AS ch, a.id, a.status
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.scheduled_date BETWEEN _from AND _to
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
  ),
  created AS (
    SELECT coalesce(a.channel_type, 'Sem canal') AS ch, a.id, a.status
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.created_at >= (_from::text || ' 00:00:00-03')::timestamptz
      AND a.created_at <= (_to::text   || ' 23:59:59-03')::timestamptz
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_agendamentos_por_booking_channel(_from date, _to date, _base text DEFAULT 'criacao'::text)
 RETURNS TABLE(channel text, qtd_created integer, qtd_realizada integer, qtd_vendas integer, ids_created uuid[], ids_realizada uuid[], ids_vendas uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
  ), lab AS (
    SELECT b.id,
      CASE b.booking_channel
        WHEN 'whatsapp_crm' THEN 'WhatsApp (CRM)'
        WHEN 'ligacao_api4com' THEN 'Ligação API4COM'
        WHEN 'sdr-ia' THEN 'SDR IA'
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
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_trend_sdr(_window_days integer)
 RETURNS TABLE(day date, criadas integer, realizadas integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
    GROUP BY 1
  ),
  realizadas AS (
    SELECT a.scheduled_date AS day, count(*)::int AS n
    FROM public.agendamentos a, bounds b
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND coalesce(a.sdr_responsavel_id, a.created_by) IN (SELECT user_id FROM sdr_ids)
      AND a.scheduled_date BETWEEN b.start_day AND b.end_day
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
    GROUP BY 1
  )
  SELECT w.day, coalesce(c.n, 0), coalesce(r.n, 0)
  FROM window_days w
  LEFT JOIN criadas c ON c.day = w.day
  LEFT JOIN realizadas r ON r.day = w.day
  ORDER BY w.day;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_trend_vendas(_window_days integer, _closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(day date, realizadas integer, vendas integer, faturamento numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
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
$function$;