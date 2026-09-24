CREATE OR REPLACE FUNCTION public.normalize_lead_phone(_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN d IS NULL OR d = '' THEN NULL
    WHEN length(d) >= 12 AND left(d, 2) = '55' THEN substr(d, 3)
    ELSE d END
  FROM (SELECT regexp_replace(coalesce(_phone, ''), '\D', '', 'g') AS d) s
$$;

CREATE TABLE IF NOT EXISTS public.lead_qualificacao (
  phone_norm text PRIMARY KEY,
  desqualificado boolean NOT NULL DEFAULT false,
  motivo text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lead_qualificacao TO authenticated;
GRANT ALL ON public.lead_qualificacao TO service_role;
ALTER TABLE public.lead_qualificacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem qualificacao do lead" ON public.lead_qualificacao
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.lead_qualificacao (phone_norm, desqualificado, motivo)
SELECT DISTINCT public.normalize_lead_phone(lead_phone), true, 'backfill: agendamento marcado como desqualificado'
FROM public.agendamentos
WHERE lead_desqualificado AND deleted_at IS NULL AND public.normalize_lead_phone(lead_phone) IS NOT NULL
ON CONFLICT (phone_norm) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_desqualificado_closer_treinamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_treinamento boolean;
  v_phone text := public.normalize_lead_phone(NEW.lead_phone);
  v_lead_desq boolean;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    -- Condição pertence ao LEAD (telefone): herda do cadastro ou de reuniões anteriores.
    SELECT desqualificado INTO v_lead_desq FROM public.lead_qualificacao WHERE phone_norm = v_phone;
    IF v_lead_desq IS NULL AND v_phone IS NOT NULL THEN
      SELECT true INTO v_lead_desq FROM public.agendamentos
       WHERE public.normalize_lead_phone(lead_phone) = v_phone AND lead_desqualificado AND deleted_at IS NULL
       LIMIT 1;
    END IF;
    IF v_lead_desq THEN NEW.lead_desqualificado := true; END IF;
  ELSE
    IF OLD.lead_desqualificado AND NOT NEW.lead_desqualificado
       AND coalesce(current_setting('app.requalificar', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Lead desqualificado: só gestor/admin pode requalificar (use a opção de requalificação com motivo).';
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

CREATE OR REPLACE FUNCTION public.requalificar_lead(_agendamento_id uuid, _motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ag record;
  v_phone text;
  v_name text;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'Só gestor/admin pode requalificar um lead desqualificado.';
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
$$;
GRANT EXECUTE ON FUNCTION public.requalificar_lead(uuid, text) TO authenticated;