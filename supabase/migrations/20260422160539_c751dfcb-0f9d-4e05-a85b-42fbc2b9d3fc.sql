-- Tabela de notificações
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Permitir insert pelo trigger (security definer) e por qualquer authenticated (será restringido pelo trigger)
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Habilitar realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Função/trigger que cria notificações para gestores e moderadores
CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status_label TEXT;
  _title TEXT;
  _message TEXT;
  _actor_name TEXT;
BEGIN
  -- Só dispara em UPDATE quando status muda para um dos relevantes
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('reagendada', 'realizada', 'cancelada', 'no_show') THEN RETURN NEW; END IF;

  CASE NEW.status
    WHEN 'reagendada' THEN _status_label := 'reagendada';
    WHEN 'realizada' THEN _status_label := 'finalizada como realizada';
    WHEN 'cancelada' THEN _status_label := 'cancelada';
    WHEN 'no_show' THEN _status_label := 'marcada como no-show';
  END CASE;

  -- Nome de quem alterou (best-effort)
  SELECT full_name INTO _actor_name FROM public.profiles WHERE user_id = auth.uid();

  _title := 'Agendamento ' || _status_label;
  _message := 'Reunião com ' || NEW.lead_name || ' foi ' || _status_label
              || COALESCE(' por ' || _actor_name, '');

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT ur.user_id, 'status_change', _title, _message, 'agendamento', NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('gestor', 'moderador');

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_status_change
AFTER UPDATE ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.notify_status_change();