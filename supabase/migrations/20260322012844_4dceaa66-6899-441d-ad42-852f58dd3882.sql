-- Add active column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Create settings table for app-wide configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only gestors can manage settings
CREATE POLICY "Gestors can manage settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

-- Authenticated can read settings
CREATE POLICY "Authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

-- Seed default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('business_hours_start', '09:00'),
  ('business_hours_end', '23:00'),
  ('meeting_duration', '60'),
  ('datacrazy_webhook_url', '')
ON CONFLICT (key) DO NOTHING;