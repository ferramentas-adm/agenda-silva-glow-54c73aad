-- Gestores/moderadores podem mover reuniões livremente entre Turma A e Turma B,
-- sem que a marcação de qualificação do lead seja alterada.
CREATE OR REPLACE FUNCTION public.can_turma_livre(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY (ARRAY['gestor','moderador']::app_role[])
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_desqualificado_closer_treinamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_treinamento boolean;
  v_phone text := public.normalize_lead_phone(NEW.lead_phone);
  v_lead_desq boolean;
  v_livre boolean := coalesce(current_setting('app.turma_livre', true), '') = 'on'
                     OR public.can_turma_livre(auth.uid());
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
    -- Mover de Turma A para Turma B é livre: trocar para closer da Turma B marca o lead
    -- como desqualificado. Gestores/moderadores ficam de fora: para eles a alocação em
    -- outra turma é um encaixe operacional e NÃO rebaixa a qualificação do lead.
    IF NOT v_livre
       AND NEW.closer_id IS NOT NULL AND NEW.closer_id IS DISTINCT FROM OLD.closer_id
       AND NOT NEW.lead_desqualificado THEN
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

  -- Gestores/moderadores têm controle livre das marcações entre turmas.
  IF v_livre AND TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  IF NEW.lead_desqualificado AND NOT v_treinamento THEN
    RAISE EXCEPTION 'Lead desqualificado: só closers da Turma B';
  END IF;
  IF NOT NEW.lead_desqualificado AND v_treinamento THEN
    RAISE EXCEPTION 'Lead qualificado: só closers da Turma A';
  END IF;
  RETURN NEW;
END;
$$;

-- Transferência de closer feita por gestor/moderador através de edge function
-- (service role, sem auth.uid()): libera a regra de turma nesta transação.
CREATE OR REPLACE FUNCTION public.transfer_closer_turma_livre(
  _agendamento_id uuid,
  _new_closer_id uuid,
  _meet_link text DEFAULT NULL,
  _google_event_id text DEFAULT NULL,
  _update_google boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.closers WHERE id = _new_closer_id AND active) THEN
    RAISE EXCEPTION 'Closer destino inválido ou inativo';
  END IF;
  PERFORM set_config('app.turma_livre', 'on', true);
  IF _update_google THEN
    UPDATE public.agendamentos
       SET closer_id = _new_closer_id, meet_link = _meet_link, google_event_id = _google_event_id, updated_at = now()
     WHERE id = _agendamento_id;
  ELSE
    UPDATE public.agendamentos
       SET closer_id = _new_closer_id, updated_at = now()
     WHERE id = _agendamento_id;
  END IF;
  PERFORM set_config('app.turma_livre', 'off', true);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_turma_livre(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_closer_turma_livre(uuid, uuid, text, text, boolean) TO service_role;