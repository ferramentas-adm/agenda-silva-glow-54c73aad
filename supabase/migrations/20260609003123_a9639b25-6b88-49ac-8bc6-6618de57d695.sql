-- 1) Trigger corrigido
CREATE OR REPLACE FUNCTION public.detect_and_mark_reschedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _normalized_phone TEXT;
  _prior_id UUID;
  _prior_status TEXT;
BEGIN
  IF NEW.original_agendamento_id IS NOT NULL THEN
    -- já veio marcado pela UI; ainda assim, garante que a original vire 'reagendada'
    UPDATE public.agendamentos
       SET status = 'reagendada'
     WHERE id = NEW.original_agendamento_id
       AND status IN ('agendada','confirmada');
    RETURN NEW;
  END IF;

  -- 2ª reunião nunca é reagendamento
  IF NEW.meeting_reason = 'segunda_reuniao' THEN
    RETURN NEW;
  END IF;

  _normalized_phone := regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g');
  IF _normalized_phone = '' THEN
    RETURN NEW;
  END IF;

  -- Busca agenda anterior do mesmo telefone nos últimos 7 dias,
  -- ignorando reuniões já realizadas (essas geram 2ª reunião, não reagendamento).
  SELECT a.id, a.status::text
    INTO _prior_id, _prior_status
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') = _normalized_phone
    AND a.scheduled_date >= (CURRENT_DATE - INTERVAL '7 days')
    AND a.status <> 'realizada'
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF _prior_id IS NOT NULL THEN
    NEW.original_agendamento_id := _prior_id;
    -- Marca a original como reagendada apenas se ainda estava ativa
    IF _prior_status IN ('agendada','confirmada') THEN
      UPDATE public.agendamentos
         SET status = 'reagendada'
       WHERE id = _prior_id
         AND status IN ('agendada','confirmada');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Limpa backfill incorreto: 2ª reunião OU original já realizada
UPDATE public.agendamentos a
   SET original_agendamento_id = NULL
  FROM public.agendamentos p
 WHERE a.deleted_at IS NULL
   AND a.original_agendamento_id IS NOT NULL
   AND a.created_at >= now() - INTERVAL '30 days'
   AND p.id = a.original_agendamento_id
   AND (a.meeting_reason = 'segunda_reuniao' OR p.status = 'realizada');

-- 3) Marca status='reagendada' nas originais dos reagendamentos legítimos remanescentes
UPDATE public.agendamentos p
   SET status = 'reagendada'
  FROM public.agendamentos a
 WHERE a.deleted_at IS NULL
   AND a.original_agendamento_id IS NOT NULL
   AND a.created_at >= now() - INTERVAL '30 days'
   AND p.id = a.original_agendamento_id
   AND p.status IN ('agendada','confirmada');