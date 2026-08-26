CREATE OR REPLACE FUNCTION public.detect_and_mark_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized_phone TEXT;
  _prior_id UUID;
BEGIN
  -- Vendas avulsas (criadas para registrar venda antiga) nunca são reagendamento.
  IF COALESCE(NEW.is_venda_avulsa, FALSE) THEN
    RETURN NEW;
  END IF;

  -- A partir de 26/08/2026 o status "reagendada" foi descontinuado: toda nova
  -- agenda é uma reunião nova. Aqui apenas registramos o VÍNCULO histórico
  -- (original_agendamento_id) — sem alterar o status da reunião anterior.
  IF NEW.original_agendamento_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.meeting_reason = 'segunda_reuniao' THEN
    RETURN NEW;
  END IF;

  _normalized_phone := regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g');
  IF _normalized_phone = '' THEN
    RETURN NEW;
  END IF;

  SELECT a.id
    INTO _prior_id
  FROM public.agendamentos a
  WHERE a.deleted_at IS NULL
    AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') = _normalized_phone
    AND a.scheduled_date >= (CURRENT_DATE - INTERVAL '7 days')
    AND a.status IN ('agendada','confirmada')
    AND COALESCE(a.is_venda_avulsa, FALSE) = FALSE
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF _prior_id IS NOT NULL THEN
    NEW.original_agendamento_id := _prior_id;
  END IF;

  RETURN NEW;
END;
$$;