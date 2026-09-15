CREATE OR REPLACE FUNCTION public.enforce_desqualificado_closer_treinamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_closer_treinamento boolean;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.closer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(em_treinamento, false) INTO v_closer_treinamento
  FROM public.closers
  WHERE id = NEW.closer_id;

  IF v_closer_treinamento IS NULL THEN
    RETURN NEW;
  END IF;

  -- Em INSERT a regra continua rígida: a criação precisa nascer na turma certa.
  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_desqualificado AND NOT v_closer_treinamento THEN
      RAISE EXCEPTION 'Lead desqualificado só pode ser alocado com closer em treinamento.';
    END IF;
    IF NOT NEW.lead_desqualificado AND v_closer_treinamento THEN
      RAISE EXCEPTION 'Closer em treinamento só pode receber lead desqualificado.';
    END IF;
    RETURN NEW;
  END IF;

  -- Em UPDATE (transferência manual entre closers), a marcação do lead
  -- acompanha a turma do closer de destino em vez de bloquear a operação.
  IF NEW.lead_desqualificado <> v_closer_treinamento THEN
    NEW.lead_desqualificado := v_closer_treinamento;
  END IF;

  RETURN NEW;
END;
$function$;