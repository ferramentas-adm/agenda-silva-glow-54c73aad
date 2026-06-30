INSERT INTO public.role_permissions (role, permission_key, allowed) VALUES
  ('supervisor','view_calendar', true),
  ('supervisor','view_meetings', true),
  ('supervisor','view_follow_ups', true),
  ('supervisor','manage_tasks', true),
  ('supervisor','view_dashboard_comercial', false),
  ('supervisor','view_dashboard_leads', false),
  ('supervisor','manage_payments', true),
  ('supervisor','view_payments', true),
  ('supervisor','view_admin', false),
  ('supervisor','view_audit_logs', false),
  ('supervisor','create_appointment', true),
  ('supervisor','edit_appointment_time', true),
  ('supervisor','assign_closer', true)
ON CONFLICT (role, permission_key) DO NOTHING;