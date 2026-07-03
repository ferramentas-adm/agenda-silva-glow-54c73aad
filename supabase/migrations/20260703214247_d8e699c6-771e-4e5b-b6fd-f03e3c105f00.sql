
-- 1) Seed matriz de permissões para 'apresentador' (apenas visualizações)
INSERT INTO public.role_permissions (role, permission_key, allowed) VALUES
  ('apresentador'::app_role, 'view_calendar', true),
  ('apresentador'::app_role, 'view_meetings', true),
  ('apresentador'::app_role, 'view_follow_ups', true),
  ('apresentador'::app_role, 'view_dashboard_comercial', true),
  ('apresentador'::app_role, 'view_dashboard_leads', true),
  ('apresentador'::app_role, 'view_payments', true),
  ('apresentador'::app_role, 'view_audit_logs', true),
  ('apresentador'::app_role, 'manage_tasks', false),
  ('apresentador'::app_role, 'manage_payments', false),
  ('apresentador'::app_role, 'view_admin', false),
  ('apresentador'::app_role, 'create_appointment', false),
  ('apresentador'::app_role, 'edit_appointment_time', false),
  ('apresentador'::app_role, 'assign_closer', false)
ON CONFLICT (role, permission_key) DO NOTHING;

-- 2) RLS: leitura para apresentador em tabelas hoje restritas
CREATE POLICY "Apresentador can view profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'apresentador'::app_role));

CREATE POLICY "Apresentador can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'apresentador'::app_role));

CREATE POLICY "Apresentador can view lead_metrics"
  ON public.lead_metrics FOR SELECT
  USING (public.has_role(auth.uid(), 'apresentador'::app_role));

CREATE POLICY "Apresentador can view tasks"
  ON public.tasks FOR SELECT
  USING (public.has_role(auth.uid(), 'apresentador'::app_role));
