ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS closer_turma text;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_closer_turma_chk CHECK (closer_turma IS NULL OR closer_turma IN ('A','B'));
COMMENT ON COLUMN public.agendamentos.closer_turma IS 'Turma (A/B) do closer no momento da reunião; congelada após realizada.';

CREATE OR REPLACE FUNCTION public.set_agendamento_closer_turma()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.closer_id IS DISTINCT FROM OLD.closer_id
     OR (NEW.status IS DISTINCT FROM OLD.status AND OLD.status <> 'realizada')
     OR (NEW.closer_turma IS NULL AND NEW.closer_id IS NOT NULL) THEN
    IF NEW.closer_id IS NULL THEN
      NEW.closer_turma := NULL;
    ELSE
      SELECT CASE WHEN c.em_treinamento THEN 'B' ELSE 'A' END INTO NEW.closer_turma
      FROM public.closers c WHERE c.id = NEW.closer_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_agendamento_closer_turma ON public.agendamentos;
CREATE TRIGGER trg_set_agendamento_closer_turma
BEFORE INSERT OR UPDATE OF closer_id, status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.set_agendamento_closer_turma();

ALTER TABLE public.agendamentos DISABLE TRIGGER USER;
UPDATE public.agendamentos a SET closer_turma = CASE WHEN c.em_treinamento THEN 'B' ELSE 'A' END
FROM public.closers c WHERE c.id = a.closer_id;
ALTER TABLE public.agendamentos ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION public.dashboard_conversao_period(p_from date, p_to date, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_reunioes integer, total_vendas integer, ids uuid[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH ags AS MATERIALIZED (
    SELECT a.id,
           a.scheduled_date,
           regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos a
    WHERE a.deleted_at IS NULL
      AND a.status = 'realizada'
      AND COALESCE(a.is_venda_avulsa, false) = false
      AND COALESCE(a.meeting_reason, '') <> 'segunda_reuniao'
      AND a.scheduled_date BETWEEN p_from AND p_to
      AND (p_closer_id IS NULL OR a.closer_id = p_closer_id)
      AND a.closer_turma = 'A'
      AND (
        NOT COALESCE(a.lead_desqualificado, false)
        OR EXISTS (
          SELECT 1 FROM public.vendas vd
          WHERE vd.agendamento_id = a.id AND vd.vendeu IS TRUE AND COALESCE(vd.valor, 0) > 0
        )
      )
  ),
  latest_venda AS MATERIALIZED (
    SELECT DISTINCT ON (v.agendamento_id)
      v.agendamento_id,
      v.vendeu,
      v.closed_at,
      lower(trim(coalesce(v.motivo_nao_fechamento, ''))) AS motivo
    FROM public.vendas v
    WHERE v.agendamento_id IN (SELECT id FROM ags)
    ORDER BY v.agendamento_id, v.created_at DESC
  ),
  segundas AS MATERIALIZED (
    SELECT s.original_agendamento_id,
           s.scheduled_date,
           regexp_replace(COALESCE(s.lead_phone, ''), '\D', '', 'g') AS phone
    FROM public.agendamentos s
    WHERE s.deleted_at IS NULL
      AND s.meeting_reason = 'segunda_reuniao'
      AND COALESCE(s.is_venda_avulsa, false) = false
      AND EXISTS (
        SELECT 1 FROM public.vendas v
        WHERE v.agendamento_id = s.id AND v.vendeu IS TRUE
      )
  ),
  seg_direct AS MATERIALIZED (
    SELECT DISTINCT original_agendamento_id AS id
    FROM segundas
    WHERE original_agendamento_id IS NOT NULL
  ),
  seg_phone AS MATERIALIZED (
    SELECT phone, max(scheduled_date) AS last_date
    FROM segundas
    WHERE original_agendamento_id IS NULL
      AND phone <> ''
    GROUP BY phone
  ),
  validos AS (
    SELECT a.id,
           (
             (
               coalesce(lv.vendeu, false)
               AND (lv.closed_at IS NULL OR lv.closed_at BETWEEN p_from AND p_to)
             )
             OR sd.id IS NOT NULL
             OR (sp.phone IS NOT NULL AND a.scheduled_date <= sp.last_date)
           ) AS vendeu
    FROM ags a
    LEFT JOIN latest_venda lv ON lv.agendamento_id = a.id
    LEFT JOIN seg_direct sd ON sd.id = a.id
    LEFT JOIN seg_phone sp ON a.phone <> '' AND sp.phone = a.phone
    WHERE NOT (
      lv.vendeu IS NOT NULL
      AND lv.vendeu = false
      AND lv.motivo IN ('call interompida', 'call interrompida')
    )
  )
  SELECT
    COUNT(*)::int AS total_reunioes,
    COUNT(*) FILTER (WHERE vendeu)::int AS total_vendas,
    COALESCE(array_agg(id), ARRAY[]::uuid[]) AS ids
  FROM validos;
$function$;