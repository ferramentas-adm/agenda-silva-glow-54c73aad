CREATE TABLE public.requalificacao_autorizados (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.requalificacao_autorizados TO authenticated;
GRANT ALL ON public.requalificacao_autorizados TO service_role;
ALTER TABLE public.requalificacao_autorizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados veem autorizados" ON public.requalificacao_autorizados FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.can_requalificar(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT _user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.requalificacao_autorizados WHERE user_id = _user_id) $$;

CREATE OR REPLACE FUNCTION public.requalificar_lead(_agendamento_id uuid, _motivo text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ag record;
  v_phone text;
  v_name text;
BEGIN
  IF NOT public.can_requalificar(auth.uid()) THEN
    RAISE EXCEPTION 'Só Antônio da Silva, Pedro Vieira e Letícia Castro podem mover lead para a Turma A';
  END IF;
  IF coalesce(length(trim(_motivo)), 0) < 10 THEN
    RAISE EXCEPTION 'Informe o motivo da requalificação (mínimo 10 caracteres).';
  END IF;
  SELECT * INTO v_ag FROM public.agendamentos WHERE id = _agendamento_id AND deleted_at IS NULL;
  IF v_ag IS NULL THEN RAISE EXCEPTION 'Agendamento não encontrado'; END IF;
  v_phone := public.normalize_lead_phone(v_ag.lead_phone);

  PERFORM set_config('app.requalificar', 'on', true);
  INSERT INTO public.lead_qualificacao (phone_norm, desqualificado, motivo, updated_by, updated_at)
  VALUES (v_phone, false, _motivo, auth.uid(), now())
  ON CONFLICT (phone_norm) DO UPDATE SET desqualificado = false, motivo = _motivo, updated_by = auth.uid(), updated_at = now();
  UPDATE public.agendamentos SET lead_desqualificado = false WHERE id = _agendamento_id;
  PERFORM set_config('app.requalificar', 'off', true);

  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = auth.uid();
  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (auth.uid(), coalesce(v_name, 'Gestor'), 'requalificar_lead', 'agendamento', _agendamento_id::text,
    jsonb_build_object('lead_name', v_ag.lead_name, 'lead_phone', v_ag.lead_phone, 'de', 'desqualificado', 'para', 'qualificado', 'motivo', _motivo));
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_desqualificado_closer_treinamento()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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