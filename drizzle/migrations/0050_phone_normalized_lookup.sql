CREATE INDEX IF NOT EXISTS idx_agendamentos_phone_norm ON public.agendamentos (public.normalize_lead_phone(lead_phone)) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.phones_com_realizada(_phones text[])
RETURNS TABLE(phone_norm text, first_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.normalize_lead_phone(a.lead_phone), min(a.scheduled_date)
  FROM public.agendamentos a
  WHERE auth.uid() IS NOT NULL
    AND a.deleted_at IS NULL AND a.status = 'realizada'
    AND public.normalize_lead_phone(a.lead_phone) = ANY (SELECT public.normalize_lead_phone(p) FROM unnest(_phones) p)
  GROUP BY 1
$$;

CREATE OR REPLACE FUNCTION public.phones_primeira_venda(_phones text[])
RETURNS TABLE(phone_norm text, first_close date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.normalize_lead_phone(a.lead_phone),
         min(coalesce(v.closed_at, (v.created_at AT TIME ZONE 'America/Sao_Paulo')::date))
  FROM public.vendas v JOIN public.agendamentos a ON a.id = v.agendamento_id
  WHERE auth.uid() IS NOT NULL
    AND a.deleted_at IS NULL AND v.vendeu IS TRUE AND coalesce(v.valor,0) > 0
    AND public.normalize_lead_phone(a.lead_phone) = ANY (SELECT public.normalize_lead_phone(p) FROM unnest(_phones) p)
  GROUP BY 1
$$;

REVOKE ALL ON FUNCTION public.phones_com_realizada(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.phones_primeira_venda(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phones_com_realizada(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phones_primeira_venda(text[]) TO authenticated;