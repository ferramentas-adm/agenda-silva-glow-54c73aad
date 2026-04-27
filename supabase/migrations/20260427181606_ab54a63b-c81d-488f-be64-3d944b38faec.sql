INSERT INTO public.role_permissions (role, permission_key, allowed)
VALUES
  ('gestor', 'edit_appointment_time', true),
  ('moderador', 'edit_appointment_time', true),
  ('closer', 'edit_appointment_time', true),
  ('sdr', 'edit_appointment_time', true)
ON CONFLICT (role, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed;