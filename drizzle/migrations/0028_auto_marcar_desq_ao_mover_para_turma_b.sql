CREATE OR REPLACE FUNCTION public.enforce_desqualificado_closer_treinamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_treinamento boolean;
  v_phone text := public.normalize_lead_phone(NEW.lead_phone);
  v_lead_desq boolean;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT desqualificado INTO v_lead_desq FROM public.lead_qualificacao WHERE phone_norm = v_phone;
    IF v_lead_desq IS NULL AND v_phone IS NOT NULL THEN
      SELECT true INTO v_lead_desq FROM public.agendamentos
       WHERE public.normalize_lead_phone(lead_phone) = v_phone AND lead_desqualificado AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_lead_desq THEN NEW.lead_desqualificado := true; END IF;
  ELSE
    IF OLD.lead_desqualificado AND NOT NEW.lead_desqualificado THEN
      IF coalesce(current_setting('app.requalificar', true), '') <> 'on'
         OR NOT public.can_requalificar(auth.uid()) THEN
        RAISE EXCEPTION 'Só Antônio da Silva, Pedro Vieira e Letícia Castro podem mover lead para a Turma A';
      END IF;
    END IF;
    -- Mover de Turma A para Turma B é livre: trocar para closer da Turma B marca o lead como desqualificado.
    IF NEW.closer_id IS NOT NULL AND NEW.closer_id IS DISTINCT FROM OLD.closer_id AND NOT NEW.lead_desqualificado THEN
      SELECT coalesce(em_treinamento, false) INTO v_treinamento FROM public.closers WHERE id = NEW.closer_id;
      IF v_treinamento THEN NEW.lead_desqualificado := true; END IF;
    END IF;
  END IF;

  IF NEW.lead_desqualificado AND v_phone IS NOT NULL THEN
    INSERT INTO public.lead_qualificacao (phone_norm, desqualificado, updated_by, updated_at)
    VALUES (v_phone, true, auth.uid(), now())
    ON CONFLICT (phone_norm) DO UPDATE SET desqualificado = true, updated_by = EXCLUDED.updated_by, updated_at = now()
    WHERE lead_qualificacao.desqualificado = false;
  END IF;

  IF NEW.closer_id IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(em_treinamento, false) INTO v_treinamento FROM public.closers WHERE id = NEW.closer_id;
  IF v_treinamento IS NULL THEN RETURN NEW; END IF;

  IF NEW.lead_desqualificado AND NOT v_treinamento THEN
    RAISE EXCEPTION 'Lead desqualificado: só closers da Turma B';
  END IF;
  IF NOT NEW.lead_desqualificado AND v_treinamento THEN
    RAISE EXCEPTION 'Lead qualificado: só closers da Turma A';
  END IF;
  RETURN NEW;
END;
$function$;