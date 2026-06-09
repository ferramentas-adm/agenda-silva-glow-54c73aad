
CREATE OR REPLACE FUNCTION public.clear_followup_on_segunda_reuniao_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _phone TEXT;
  _is_segunda BOOLEAN;
BEGIN
  IF NEW.vendeu IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT a.meeting_reason = 'segunda_reuniao',
         regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g')
    INTO _is_segunda, _phone
  FROM public.agendamentos a
  WHERE a.id = NEW.agendamento_id;

  IF NOT COALESCE(_is_segunda, FALSE) OR _phone = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.vendas v
     SET follow_up = FALSE,
         follow_up_date = NULL,
         follow_up_time = NULL
   FROM public.agendamentos a
   WHERE v.agendamento_id = a.id
     AND v.id <> NEW.id
     AND v.follow_up = TRUE
     AND a.deleted_at IS NULL
     AND regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g') = _phone;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_followup_on_segunda_reuniao_sale ON public.vendas;
CREATE TRIGGER trg_clear_followup_on_segunda_reuniao_sale
AFTER INSERT OR UPDATE OF vendeu ON public.vendas
FOR EACH ROW
EXECUTE FUNCTION public.clear_followup_on_segunda_reuniao_sale();

-- Backfill: limpa follow-ups ativos de leads que já tiveram venda em 2ª reunião
UPDATE public.vendas v
   SET follow_up = FALSE, follow_up_date = NULL, follow_up_time = NULL
  FROM public.agendamentos a
 WHERE v.agendamento_id = a.id
   AND v.follow_up = TRUE
   AND a.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.vendas v2
       JOIN public.agendamentos a2 ON a2.id = v2.agendamento_id
      WHERE v2.vendeu = TRUE
        AND a2.meeting_reason = 'segunda_reuniao'
        AND a2.deleted_at IS NULL
        AND regexp_replace(COALESCE(a2.lead_phone,''), '\D', '', 'g')
            = regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g')
        AND regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g') <> ''
   );
