ALTER TABLE public.closer_blocks ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.audit_closer_block_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
  _email text;
  _row public.closer_blocks;
  _closer text;
  _action text;
  _details jsonb;
BEGIN
  _row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF TG_OP = 'UPDATE' AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.block_date IS NOT DISTINCT FROM OLD.block_date AND NEW.block_type IS NOT DISTINCT FROM OLD.block_type
     AND NEW.recurrence_weekday IS NOT DISTINCT FROM OLD.recurrence_weekday AND NEW.is_recurring IS NOT DISTINCT FROM OLD.is_recurring THEN
    RETURN NEW;
  END IF;
  SELECT full_name, email INTO _name, _email FROM public.profiles WHERE user_id = _uid;
  SELECT name INTO _closer FROM public.closers WHERE id = _row.closer_id;
  _action := CASE TG_OP WHEN 'INSERT' THEN 'create_closer_block' WHEN 'UPDATE' THEN 'edit_closer_block' ELSE 'delete_closer_block' END;
  _details := jsonb_build_object(
    'closer_id', _row.closer_id, 'closer_name', _closer, 'date', _row.block_date,
    'start_time', _row.start_time, 'end_time', _row.end_time, 'reason', _row.block_type,
    'description', _row.description, 'is_recurring', _row.is_recurring,
    'recurrence_weekday', _row.recurrence_weekday, 'source', 'database');
  IF TG_OP = 'UPDATE' THEN
    _details := _details || jsonb_build_object('old_start_time', OLD.start_time, 'old_end_time', OLD.end_time,
      'new_start_time', NEW.start_time, 'new_end_time', NEW.end_time, 'old_date', OLD.block_date);
  END IF;
  INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
  VALUES (COALESCE(_uid, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(_name, 'Sistema/API'), _email,
          _action, 'closer_block', _row.id::text, _details);
  RETURN _row;
END $$;

DROP TRIGGER IF EXISTS trg_audit_closer_blocks ON public.closer_blocks;
CREATE TRIGGER trg_audit_closer_blocks AFTER INSERT OR UPDATE OR DELETE ON public.closer_blocks
FOR EACH ROW EXECUTE FUNCTION public.audit_closer_block_change();

CREATE OR REPLACE FUNCTION public.audit_closer_block_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text; _email text; _closer text; _action text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.undone_at IS NULL AND NEW.undone_at IS NOT NULL) THEN RETURN NEW; END IF;
    _action := 'undo_release_closer_block';
  ELSE
    _action := 'release_closer_block';
  END IF;
  SELECT full_name, email INTO _name, _email FROM public.profiles WHERE user_id = _uid;
  SELECT name INTO _closer FROM public.closers WHERE id = NEW.closer_id;
  INSERT INTO public.audit_logs(user_id, user_name, user_email, action, entity_type, entity_id, details)
  VALUES (COALESCE(_uid, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(_name, NEW.released_by_name, 'Sistema/API'), _email,
          _action, 'closer_block_release', NEW.id::text,
          jsonb_build_object('closer_id', NEW.closer_id, 'closer_name', _closer, 'date', NEW.release_date,
            'start_time', NEW.start_time, 'end_time', NEW.end_time, 'reason', NEW.original_block_type,
            'description', NEW.original_description, 'somente_neste_dia', NEW.exception_id IS NOT NULL,
            'original_block', NEW.original_block));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_closer_block_releases ON public.closer_block_releases;
CREATE TRIGGER trg_audit_closer_block_releases AFTER INSERT OR UPDATE ON public.closer_block_releases
FOR EACH ROW EXECUTE FUNCTION public.audit_closer_block_release();