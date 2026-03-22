-- Add business hours columns to closers
ALTER TABLE public.closers
  ADD COLUMN IF NOT EXISTS business_hours_start text NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS business_hours_end text NOT NULL DEFAULT '22:00';

-- Create table for storing Google OAuth tokens per closer
CREATE TABLE public.closer_google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id uuid NOT NULL REFERENCES public.closers(id) ON DELETE CASCADE UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expiry timestamptz NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.closer_google_tokens ENABLE ROW LEVEL SECURITY;

-- Only gestors can manage Google tokens
CREATE POLICY "Gestors can manage google tokens"
  ON public.closer_google_tokens
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

-- Update trigger for updated_at
CREATE TRIGGER update_closer_google_tokens_updated_at
  BEFORE UPDATE ON public.closer_google_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();