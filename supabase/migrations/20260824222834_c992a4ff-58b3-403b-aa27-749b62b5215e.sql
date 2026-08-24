ALTER TABLE public.closers
  ADD COLUMN IF NOT EXISTS auto_recording_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.closer_google_tokens
  ADD COLUMN IF NOT EXISTS granted_scopes text;