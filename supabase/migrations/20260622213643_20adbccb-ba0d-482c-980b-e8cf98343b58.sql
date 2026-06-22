
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_sdr_override boolean NOT NULL DEFAULT false;

UPDATE public.profiles
   SET is_sdr_override = true
 WHERE translate(lower(full_name),
                 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
       IN ('bruna angelica', 'lucas emanuel');

DROP FUNCTION IF EXISTS public.get_public_profiles();
CREATE OR REPLACE FUNCTION public.get_public_profiles()
 RETURNS TABLE(user_id uuid, full_name text, is_sdr_override boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.full_name, COALESCE(p.is_sdr_override, false)
  FROM public.profiles p
  WHERE p.active = true
  ORDER BY p.full_name;
$function$;
