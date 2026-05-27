
REVOKE SELECT ON public.closer_google_tokens FROM authenticated, anon;
GRANT SELECT (id, closer_id, calendar_id, token_expiry, created_at, updated_at) ON public.closer_google_tokens TO authenticated;
GRANT ALL ON public.closer_google_tokens TO service_role;

DROP POLICY IF EXISTS "Authenticated can view lead_metrics" ON public.lead_metrics;
CREATE POLICY "Managers can view lead_metrics"
  ON public.lead_metrics FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role));

DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime"
  ON realtime.messages FOR SELECT TO authenticated USING (true);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_public_profiles() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_profiles() TO authenticated, service_role;
