CREATE TABLE public.threec_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  campaign_id text NOT NULL,
  list_id text NOT NULL,
  statuses text[] NOT NULL DEFAULT ARRAY['no_show'],
  reasons text[] NOT NULL DEFAULT '{}',
  only_no_sale boolean NOT NULL DEFAULT true,
  nao_fechamento_reasons text[] NOT NULL DEFAULT '{}',
  skip_future boolean NOT NULL DEFAULT true,
  dedupe boolean NOT NULL DEFAULT true,
  include_desqualificados boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.threec_rules TO authenticated;
GRANT ALL ON public.threec_rules TO service_role;
ALTER TABLE public.threec_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage threec rules" ON public.threec_rules FOR ALL TO authenticated USING (public.is_manager()) WITH CHECK (public.is_manager());

CREATE TABLE public.threec_sent (
  list_id text NOT NULL,
  telefone text NOT NULL,
  rule_id uuid,
  agendamento_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, telefone)
);
GRANT SELECT ON public.threec_sent TO authenticated;
GRANT ALL ON public.threec_sent TO service_role;
ALTER TABLE public.threec_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read threec sent v2" ON public.threec_sent FOR SELECT TO authenticated USING (public.is_manager());

INSERT INTO public.threec_sent (list_id, telefone, agendamento_id, sent_at)
SELECT '4945922', telefone, agendamento_id, sent_at FROM public.threec_sent_phones ON CONFLICT DO NOTHING;
COMMENT ON TABLE public.threec_sent_phones IS 'DEPRECATED: replaced by threec_sent (per list)';

ALTER TABLE public.threec_runs ADD COLUMN rule_id uuid, ADD COLUMN rule_name text;

INSERT INTO public.threec_rules (name, campaign_id, list_id, statuses)
VALUES ('No-show sem reunião futura', '322695', '4945922', ARRAY['no_show']);

CREATE OR REPLACE FUNCTION public.threec_set_schedule(_hhmm text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h int; m int; uh int; expr text;
BEGIN
  IF NOT public.is_gestor() AND NOT public.has_role(auth.uid(), 'moderador') AND NOT public.has_role(auth.uid(), 'supervisor') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF _hhmm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Horário inválido'; END IF;
  h := split_part(_hhmm, ':', 1)::int; m := split_part(_hhmm, ':', 2)::int;
  uh := (h + 3) % 24;
  expr := m || ' ' || uh || ' * * *';
  PERFORM cron.schedule('threec-noshow-2359', expr, $cmd$
  SELECT net.http_post(
    url := 'https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/threec-noshow-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key='crm_daily_cron_token')),
    body := jsonb_build_object('kind','auto')
  );
  $cmd$);
  INSERT INTO public.app_settings (key, value) VALUES ('threec_schedule_time', _hhmm)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN expr;
END $$;
REVOKE ALL ON FUNCTION public.threec_set_schedule(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.threec_set_schedule(text) TO authenticated;