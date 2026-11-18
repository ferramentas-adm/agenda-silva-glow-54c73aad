CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = (SELECT auth.uid()))
$$;
REVOKE EXECUTE ON FUNCTION public.is_team_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member() TO authenticated, service_role;

ALTER POLICY "Authenticated users can view active closers" ON public.closers USING (public.is_team_member());
ALTER POLICY "Authenticated can read settings" ON public.app_settings USING (public.is_team_member());
ALTER POLICY "Closers can view own blocks" ON public.closer_blocks USING (public.is_team_member());
ALTER POLICY "Authenticated users can view all agendamentos" ON public.agendamentos USING (public.is_team_member());
ALTER POLICY "Authenticated can view vendas" ON public.vendas USING (public.is_team_member());
ALTER POLICY "Authenticated can read role permissions" ON public.role_permissions USING (public.is_team_member());
ALTER POLICY "Authenticated can view pagamentos" ON public.pagamentos USING (public.is_team_member());
ALTER POLICY "Authenticated can view closer error reviews" ON public.closer_error_reviews USING (public.is_team_member());
ALTER POLICY "Authenticated can view briefing comments" ON public.agendamento_briefings USING (public.is_team_member());
ALTER POLICY "tentativas_select_auth" ON public.follow_up_tentativas USING (public.is_team_member());
ALTER POLICY "Autenticados leem qualificacao do lead" ON public.lead_qualificacao USING (public.is_team_member());
ALTER POLICY "Autenticados veem autorizados" ON public.requalificacao_autorizados USING (public.is_team_member());
ALTER POLICY "Autenticados leem excecoes de bloqueio" ON public.closer_block_exceptions USING (public.is_team_member());
ALTER POLICY "Autenticados leem liberacoes" ON public.closer_block_releases USING (public.is_team_member());
ALTER POLICY "Authenticated can view venda_complementos" ON public.venda_complementos USING (public.is_team_member());

CREATE TABLE IF NOT EXISTS public.password_change_requirements (
  user_id uuid PRIMARY KEY,
  hash_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.password_change_requirements TO service_role;
ALTER TABLE public.password_change_requirements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_must_change_password()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE _snap text; _cur text;
BEGIN
  IF NEW.must_change_password IS TRUE AND (TG_OP = 'INSERT' OR OLD.must_change_password IS DISTINCT FROM TRUE) THEN
    INSERT INTO public.password_change_requirements (user_id, hash_snapshot)
    SELECT NEW.user_id, u.encrypted_password FROM auth.users u WHERE u.id = NEW.user_id
    ON CONFLICT (user_id) DO UPDATE SET hash_snapshot = EXCLUDED.hash_snapshot, created_at = now();
  ELSIF TG_OP = 'UPDATE' AND OLD.must_change_password IS TRUE AND NEW.must_change_password IS FALSE
        AND (SELECT auth.uid()) IS NOT NULL AND NOT public.is_gestor() THEN
    SELECT hash_snapshot INTO _snap FROM public.password_change_requirements WHERE user_id = NEW.user_id;
    SELECT encrypted_password INTO _cur FROM auth.users WHERE id = NEW.user_id;
    IF _cur IS NOT DISTINCT FROM _snap THEN
      RAISE EXCEPTION 'Troque a senha antes de concluir.';
    END IF;
    DELETE FROM public.password_change_requirements WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_must_change_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_must_change_password() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_must_change_password ON public.profiles;
CREATE TRIGGER trg_guard_must_change_password
BEFORE INSERT OR UPDATE OF must_change_password ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_must_change_password();

INSERT INTO public.password_change_requirements (user_id, hash_snapshot)
SELECT p.user_id, u.encrypted_password FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
WHERE p.must_change_password IS TRUE
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_crm_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _supabase_url TEXT := 'https://jrnyccjhsxcggmgupvzp.supabase.co';
  _anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnljY2poc3hjZ2dtZ3VwdnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjk0MjcsImV4cCI6MjA4OTcwNTQyN30.oMrALsWvEwRBZT9pNkrNNxWtvQOl5eRjsWruiWP84Dc';
BEGIN
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/datacrazy-crm-sync',
    body := jsonb_build_object('record', row_to_json(NEW)),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key,
      'apikey', _anon_key,
      'x-cron-secret', COALESCE((SELECT value FROM public.app_settings WHERE key = 'crm_daily_cron_token'), '')
    )
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_meta_capi(_event_name text, _agendamento_id uuid, _venda_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _url TEXT := 'https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/meta-capi-forward';
  _anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpybnljY2poc3hjZ2dtZ3VwdnpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMjk0MjcsImV4cCI6MjA4OTcwNTQyN30.oMrALsWvEwRBZT9pNkrNNxWtvQOl5eRjsWruiWP84Dc';
BEGIN
  PERFORM net.http_post(
    url := _url,
    body := jsonb_build_object('event_name', _event_name, 'agendamento_id', _agendamento_id, 'venda_id', _venda_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon,
      'apikey', _anon,
      'x-cron-secret', COALESCE((SELECT value FROM public.app_settings WHERE key = 'crm_daily_cron_token'), '')
    )
  );
END;
$function$;