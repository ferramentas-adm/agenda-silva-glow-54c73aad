CREATE OR REPLACE FUNCTION public.detect_and_mark_reschedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _normalized_phone TEXT;
  _prior_id UUID;
BEGIN
  -- Se já veio marcado (fluxo UI), não redetecta
  IF NEW.original_agendamento_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  _normalized_phone := regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g');
  IF _normalized_phone = '' THEN
    RETURN NEW;
  END IF;

  -- Busca agenda anterior do mesmo telefone nos últimos 7 dias,
  -- independentemente de quem criou a nova ou a antiga.
  SELECT a.id
    INTO _prior_id
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') = _normalized_phone
    AND a.scheduled_date >= (CURRENT_DATE - INTERVAL '7 days')
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF _prior_id IS NOT NULL THEN
    NEW.original_agendamento_id := _prior_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: marca agendamentos recentes que deveriam ser reagendamentos
WITH candidates AS (
  SELECT a.id AS new_id,
         (
           SELECT prev.id
           FROM public.agendamentos prev
           WHERE prev.deleted_at IS NULL
             AND prev.id <> a.id
             AND regexp_replace(COALESCE(prev.lead_phone,''), '\D', '', 'g')
                 = regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g')
             AND regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g') <> ''
             AND prev.created_at < a.created_at
             AND prev.scheduled_date >= (a.created_at::date - INTERVAL '7 days')
           ORDER BY prev.created_at DESC
           LIMIT 1
         ) AS prior_id
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.original_agendamento_id IS NULL
    AND a.created_at >= now() - INTERVAL '30 days'
)
UPDATE public.agendamentos a
SET original_agendamento_id = c.prior_id
FROM candidates c
WHERE a.id = c.new_id
  AND c.prior_id IS NOT NULL;