
-- 1) Bloquear soft-delete por não admin
CREATE OR REPLACE FUNCTION public.block_non_admin_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF NOT (public.has_role(auth.uid(),'gestor'::app_role) OR public.has_role(auth.uid(),'moderador'::app_role)) THEN
      RAISE EXCEPTION 'Apenas gestores e moderadores podem excluir agendamentos';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_non_admin_soft_delete ON public.agendamentos;
CREATE TRIGGER trg_block_non_admin_soft_delete
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.block_non_admin_soft_delete();

-- 2) audit_logs: adicionar coluna user_email
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 3) Trigger de auditoria de agendamentos
CREATE OR REPLACE FUNCTION public.log_agendamento_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _name text;
  _closer_name text;
  _details jsonb;
  _from text;
  _to text;
  _from_name text;
  _to_name text;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT full_name INTO _name FROM public.profiles WHERE user_id = _uid;
  _name := COALESCE(_name, _email, 'Sistema');

  IF TG_OP = 'INSERT' THEN
    IF NEW.closer_id IS NOT NULL THEN
      SELECT name INTO _closer_name FROM public.closers WHERE id = NEW.closer_id;
    END IF;
    _details := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'closer_name', COALESCE(_closer_name, ''),
      'scheduled_date', NEW.scheduled_date,
      'scheduled_time', NEW.scheduled_time,
      'channel_type', NEW.channel_type,
      'meeting_reason', NEW.meeting_reason,
      'original_agendamento_id', NEW.original_agendamento_id
    );
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'create_agendamento', 'agendamento', NEW.id::text, _details);
    RETURN NEW;
  END IF;

  -- UPDATE
  -- Soft-delete
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF NEW.closer_id IS NOT NULL THEN
      SELECT name INTO _closer_name FROM public.closers WHERE id = NEW.closer_id;
    END IF;
    _details := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'closer_name', COALESCE(_closer_name, ''),
      'scheduled_date', NEW.scheduled_date,
      'scheduled_time', NEW.scheduled_time,
      'deletion_reason', NEW.deletion_reason
    );
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'delete_agendamento', 'agendamento', NEW.id::text, _details);
    RETURN NEW;
  END IF;

  -- Status change
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _details := jsonb_build_object(
      'lead_name', NEW.lead_name,
      'scheduled_date', NEW.scheduled_date,
      'scheduled_time', NEW.scheduled_time,
      'old_status', OLD.status,
      'new_status', NEW.status
    );
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'update_status', 'agendamento', NEW.id::text, _details);
  END IF;

  -- Closer change
  IF OLD.closer_id IS DISTINCT FROM NEW.closer_id THEN
    SELECT name INTO _from_name FROM public.closers WHERE id = OLD.closer_id;
    SELECT name INTO _to_name FROM public.closers WHERE id = NEW.closer_id;
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date,
        'field', 'closer_id', 'from', COALESCE(_from_name,''), 'to', COALESCE(_to_name,'')));
  END IF;

  -- SDR responsavel change
  IF OLD.sdr_responsavel_id IS DISTINCT FROM NEW.sdr_responsavel_id THEN
    SELECT full_name INTO _from_name FROM public.profiles WHERE user_id = OLD.sdr_responsavel_id;
    SELECT full_name INTO _to_name FROM public.profiles WHERE user_id = NEW.sdr_responsavel_id;
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date,
        'field', 'sdr_responsavel_id', 'from', COALESCE(_from_name,''), 'to', COALESCE(_to_name,'')));
  END IF;

  -- Generic text/scalar fields
  IF OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'field','scheduled_date','from',OLD.scheduled_date::text,'to',NEW.scheduled_date::text));
  END IF;
  IF OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','scheduled_time','from',OLD.scheduled_time,'to',NEW.scheduled_time));
  END IF;
  IF OLD.briefing IS DISTINCT FROM NEW.briefing THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','briefing','from',COALESCE(OLD.briefing,''),'to',COALESCE(NEW.briefing,'')));
  END IF;
  IF OLD.observation IS DISTINCT FROM NEW.observation THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','observation','from',COALESCE(OLD.observation,''),'to',COALESCE(NEW.observation,'')));
  END IF;
  IF OLD.channel_type IS DISTINCT FROM NEW.channel_type THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','channel_type','from',COALESCE(OLD.channel_type,''),'to',COALESCE(NEW.channel_type,'')));
  END IF;
  IF OLD.meeting_reason IS DISTINCT FROM NEW.meeting_reason THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','meeting_reason','from',COALESCE(OLD.meeting_reason,''),'to',COALESCE(NEW.meeting_reason,'')));
  END IF;
  IF OLD.meet_link IS DISTINCT FROM NEW.meet_link THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','meet_link','from',COALESCE(OLD.meet_link,''),'to',COALESCE(NEW.meet_link,'')));
  END IF;
  IF OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','duration_minutes','from',OLD.duration_minutes,'to',NEW.duration_minutes));
  END IF;
  IF OLD.is_5k IS DISTINCT FROM NEW.is_5k THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','is_5k','from',OLD.is_5k,'to',NEW.is_5k));
  END IF;
  IF OLD.cancellation_reason IS DISTINCT FROM NEW.cancellation_reason THEN
    INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
    VALUES (_uid, _name, _email, 'edit_agendamento', 'agendamento', NEW.id::text,
      jsonb_build_object('lead_name', NEW.lead_name, 'scheduled_date', NEW.scheduled_date, 'field','cancellation_reason','from',COALESCE(OLD.cancellation_reason,''),'to',COALESCE(NEW.cancellation_reason,'')));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_agendamento_change ON public.agendamentos;
CREATE TRIGGER trg_log_agendamento_change
AFTER INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.log_agendamento_change();
