
-- agendamentos UPDATE
DROP POLICY IF EXISTS "Users can update agendamentos by role" ON public.agendamentos;
CREATE POLICY "Users can update agendamentos by role" ON public.agendamentos
FOR UPDATE
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'sdr'::app_role)
  OR (auth.uid() = created_by)
  OR (has_role(auth.uid(), 'closer'::app_role) AND closer_id IN (SELECT c.id FROM closers c WHERE c.email = auth.email()))
)
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR has_role(auth.uid(), 'sdr'::app_role)
  OR (auth.uid() = created_by)
  OR (has_role(auth.uid(), 'closer'::app_role) AND closer_id IN (SELECT c.id FROM closers c WHERE c.email = auth.email()))
);

-- vendas UPDATE
DROP POLICY IF EXISTS "Allowed users can update vendas" ON public.vendas;
CREATE POLICY "Allowed users can update vendas" ON public.vendas
FOR UPDATE
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM agendamentos a WHERE a.id = vendas.agendamento_id AND (a.created_by = auth.uid() OR (has_role(auth.uid(), 'closer'::app_role) AND a.closer_id IN (SELECT c.id FROM closers c WHERE c.email = auth.email()))))
)
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM agendamentos a WHERE a.id = vendas.agendamento_id AND (a.created_by = auth.uid() OR (has_role(auth.uid(), 'closer'::app_role) AND a.closer_id IN (SELECT c.id FROM closers c WHERE c.email = auth.email()))))
);

-- vendas DELETE
DROP POLICY IF EXISTS "Gestors and moderators can delete vendas" ON public.vendas;
CREATE POLICY "Gestors and moderators can delete vendas" ON public.vendas
FOR DELETE USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'moderador'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

-- pagamentos UPDATE / DELETE
DROP POLICY IF EXISTS "Managers can update pagamentos" ON public.pagamentos;
CREATE POLICY "Managers can update pagamentos" ON public.pagamentos
FOR UPDATE
USING (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS "Managers can delete pagamentos" ON public.pagamentos;
CREATE POLICY "Managers can delete pagamentos" ON public.pagamentos
FOR DELETE USING (
  has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)
);

-- closer_error_reviews UPDATE
DROP POLICY IF EXISTS "Gestor and moderador can update closer error reviews" ON public.closer_error_reviews;
CREATE POLICY "Gestor and moderador can update closer error reviews" ON public.closer_error_reviews
FOR UPDATE
USING (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'gestor'::app_role) OR has_role(auth.uid(), 'moderador'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Soft delete trigger
CREATE OR REPLACE FUNCTION public.block_non_admin_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF NOT (
      public.has_role(auth.uid(),'gestor'::app_role)
      OR public.has_role(auth.uid(),'moderador'::app_role)
      OR public.has_role(auth.uid(),'supervisor'::app_role)
      OR public.has_role(auth.uid(),'sdr'::app_role)
    ) THEN
      RAISE EXCEPTION 'Apenas gestores, moderadores, supervisores e SDRs podem excluir agendamentos';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Notify pending closer assignment: include supervisor
CREATE OR REPLACE FUNCTION public.notify_pending_closer_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.closer_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT ur.user_id,
         'pending_closer_assignment',
         'Reunião aguardando atribuição',
         'Reunião com ' || NEW.lead_name || ' em ' || to_char(NEW.scheduled_date, 'DD/MM') || ' às ' || NEW.scheduled_time || ' precisa de Closer.',
         'agendamento',
         NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('gestor'::app_role, 'moderador'::app_role, 'supervisor'::app_role);
  RETURN NEW;
END;
$function$;

-- Notify status change: include supervisor
CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _status_label TEXT;
  _title TEXT;
  _message TEXT;
  _actor_name TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('reagendada', 'realizada', 'cancelada', 'no_show') THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'reagendada' THEN _status_label := 'reagendada';
    WHEN 'realizada' THEN _status_label := 'finalizada como realizada';
    WHEN 'cancelada' THEN _status_label := 'cancelada';
    WHEN 'no_show' THEN _status_label := 'marcada como no-show';
  END CASE;

  SELECT full_name INTO _actor_name FROM public.profiles WHERE user_id = auth.uid();

  _title := 'Agendamento ' || _status_label;
  _message := 'Reunião com ' || NEW.lead_name || ' foi ' || _status_label
              || COALESCE(' por ' || _actor_name, '');

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT ur.user_id, 'status_change', _title, _message, 'agendamento', NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('gestor', 'moderador', 'supervisor');

  RETURN NEW;
END;
$function$;
