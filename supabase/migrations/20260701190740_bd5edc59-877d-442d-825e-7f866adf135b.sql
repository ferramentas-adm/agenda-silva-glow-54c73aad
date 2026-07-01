
DO $$ BEGIN
  CREATE TYPE public.sdr_team AS ENUM ('trafego', 'social_selling');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sdr_team public.sdr_team;

DROP FUNCTION IF EXISTS public.get_public_profiles();

CREATE OR REPLACE FUNCTION public.get_public_profiles()
 RETURNS TABLE(user_id uuid, full_name text, is_sdr_override boolean, sdr_team public.sdr_team)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.full_name, COALESCE(p.is_sdr_override, false), p.sdr_team
  FROM public.profiles p
  WHERE p.active = true
  ORDER BY p.full_name;
$function$;
