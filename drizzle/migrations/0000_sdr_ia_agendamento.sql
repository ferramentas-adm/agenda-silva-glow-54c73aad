-- Colunas novas em agendamentos (aditivas)
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS crm_lead_id text;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_idempotency_key_uidx
  ON public.agendamentos (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS agendamentos_crm_lead_id_idx
  ON public.agendamentos (crm_lead_id) WHERE crm_lead_id IS NOT NULL;

-- Tabelas do SDR IA (fechadas: só service_role)
CREATE TABLE IF NOT EXISTS public.sdr_conversas (
  conversation_id text PRIMARY KEY,
  lead_id text,
  telefone text,
  origem text,
  etapa text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  classificacao text,
  agendamento_id text,
  handoff_motivo text,
  encerrada_motivo text,
  turnos_agente int NOT NULL DEFAULT 0,
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  last_lead_message_at timestamptz,
  followups_enviados int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sdr_conversas TO service_role;
ALTER TABLE public.sdr_conversas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sdr_conversas_telefone_idx ON public.sdr_conversas (telefone);
CREATE INDEX IF NOT EXISTS sdr_conversas_etapa_idx ON public.sdr_conversas (etapa);
CREATE INDEX IF NOT EXISTS sdr_conversas_last_lead_message_at_idx ON public.sdr_conversas (last_lead_message_at);
DROP TRIGGER IF EXISTS sdr_conversas_updated_at ON public.sdr_conversas;
CREATE TRIGGER sdr_conversas_updated_at
  BEFORE UPDATE ON public.sdr_conversas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.sdr_exclusoes (
  telefone text PRIMARY KEY,
  motivo text,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.sdr_exclusoes TO service_role;
ALTER TABLE public.sdr_exclusoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sdr_config (
  chave text PRIMARY KEY,
  valor text NOT NULL DEFAULT ''
);
GRANT ALL ON public.sdr_config TO service_role;
ALTER TABLE public.sdr_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.sdr_config (chave, valor) VALUES
  ('link_video', 'https://vsl2.antoniodasilva.com.br/'),
  ('system_prompt', ''),
  ('tools_json', ''),
  ('tags_json', ''),
  ('handoff_attendant_id', '')
ON CONFLICT (chave) DO NOTHING;

-- Rótulo "SDR IA" no painel por canal do agendamento
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