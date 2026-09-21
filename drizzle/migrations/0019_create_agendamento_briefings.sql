CREATE TABLE public.agendamento_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX idx_agendamento_briefings_ag ON public.agendamento_briefings(agendamento_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamento_briefings TO authenticated;
GRANT ALL ON public.agendamento_briefings TO service_role;

ALTER TABLE public.agendamento_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view briefing comments"
ON public.agendamento_briefings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can add own briefing comments"
ON public.agendamento_briefings FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can edit own briefing comments"
ON public.agendamento_briefings FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors or managers can delete briefing comments"
ON public.agendamento_briefings FOR DELETE TO authenticated
USING (author_id = auth.uid() OR public.is_manager());

CREATE TRIGGER trg_agendamento_briefings_updated_at
BEFORE UPDATE ON public.agendamento_briefings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.log_briefing_comment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
  _row public.agendamento_briefings;
  _ag RECORD;
  _action text;
BEGIN
  IF _uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    _row := OLD;
    _action := 'remove_briefing_comment';
  ELSIF TG_OP = 'INSERT' THEN
    _row := NEW;
    _action := 'add_briefing_comment';
  ELSE
    _row := NEW;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _action := 'remove_briefing_comment';
    ELSIF OLD.content IS DISTINCT FROM NEW.content THEN
      _action := 'edit_briefing_comment';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT full_name INTO _name FROM public.profiles WHERE user_id = _uid;
  _name := COALESCE(_name, _email, 'Sistema');

  SELECT lead_name, scheduled_date, scheduled_time INTO _ag
  FROM public.agendamentos WHERE id = _row.agendamento_id;

  INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
  VALUES (_uid, _name, _email, _action, 'agendamento', _row.agendamento_id::text,
    jsonb_build_object(
      'lead_name', _ag.lead_name,
      'scheduled_date', _ag.scheduled_date,
      'scheduled_time', _ag.scheduled_time,
      'comment_id', _row.id,
      'comentario', left(_row.content, 300)
    ));

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER trg_log_briefing_comment
AFTER INSERT OR UPDATE OR DELETE ON public.agendamento_briefings
FOR EACH ROW EXECUTE FUNCTION public.log_briefing_comment_change();