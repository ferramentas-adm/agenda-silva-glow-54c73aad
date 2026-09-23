-- 1) Novas colunas de follow-up em vendas
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS follow_up_status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS follow_up_canal text,
  ADD COLUMN IF NOT EXISTS follow_up_temperatura text,
  ADD COLUMN IF NOT EXISTS follow_up_produto text,
  ADD COLUMN IF NOT EXISTS follow_up_valor numeric,
  ADD COLUMN IF NOT EXISTS follow_up_condicoes text,
  ADD COLUMN IF NOT EXISTS follow_up_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS follow_up_owner_closer_id uuid REFERENCES public.closers(id),
  ADD COLUMN IF NOT EXISTS follow_up_ultima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_balde_em timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_lixeira_em timestamptz;

ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_follow_up_status_check;
ALTER TABLE public.vendas ADD CONSTRAINT vendas_follow_up_status_check
  CHECK (follow_up_status IN ('ativo','lixeira','balde','concluido'));

ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_follow_up_canal_check;
ALTER TABLE public.vendas ADD CONSTRAINT vendas_follow_up_canal_check
  CHECK (follow_up_canal IS NULL OR follow_up_canal IN ('ligacao','whatsapp'));

ALTER TABLE public.vendas DROP CONSTRAINT IF EXISTS vendas_follow_up_temperatura_check;
ALTER TABLE public.vendas ADD CONSTRAINT vendas_follow_up_temperatura_check
  CHECK (follow_up_temperatura IS NULL OR follow_up_temperatura IN ('quente','morno','frio'));

CREATE INDEX IF NOT EXISTS idx_vendas_follow_up_status
  ON public.vendas (follow_up_status, follow_up_date)
  WHERE follow_up = true;

-- 2) Higienização: todo follow-up existente vai para a lixeira
UPDATE public.vendas
SET follow_up_status = 'lixeira',
    follow_up_lixeira_em = now()
WHERE follow_up = true
  AND vendeu = false
  AND follow_up_status = 'ativo';

-- 3) Histórico de tentativas
CREATE TABLE IF NOT EXISTS public.follow_up_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  numero integer NOT NULL,
  closer_id uuid REFERENCES public.closers(id),
  canal text,
  justificativa text NOT NULL,
  nova_data date,
  nova_hora text,
  temperatura text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_tentativas TO authenticated;
GRANT ALL ON public.follow_up_tentativas TO service_role;

ALTER TABLE public.follow_up_tentativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tentativas_select_auth" ON public.follow_up_tentativas;
CREATE POLICY "tentativas_select_auth" ON public.follow_up_tentativas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tentativas_insert_auth" ON public.follow_up_tentativas;
CREATE POLICY "tentativas_insert_auth" ON public.follow_up_tentativas
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "tentativas_update_own_or_manager" ON public.follow_up_tentativas;
CREATE POLICY "tentativas_update_own_or_manager" ON public.follow_up_tentativas
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_manager());

DROP POLICY IF EXISTS "tentativas_delete_manager" ON public.follow_up_tentativas;
CREATE POLICY "tentativas_delete_manager" ON public.follow_up_tentativas
  FOR DELETE TO authenticated USING (public.is_manager());

CREATE INDEX IF NOT EXISTS idx_follow_up_tentativas_venda
  ON public.follow_up_tentativas (venda_id, numero);

-- 4) Configuração padrão dos alertas (minutos de antecedência)
INSERT INTO public.app_settings (key, value)
VALUES ('followup_alert_offsets', '[60,30,10]')
ON CONFLICT (key) DO NOTHING;

-- 5) Rotina de virada: follow-ups vencidos sem tentativa vão para o balde
CREATE OR REPLACE FUNCTION public.expirar_follow_ups_para_balde()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  afetados integer;
BEGIN
  WITH movidos AS (
    UPDATE public.vendas v
    SET follow_up_status = 'balde',
        follow_up_balde_em = now(),
        follow_up_owner_closer_id = NULL
    WHERE v.follow_up = true
      AND v.vendeu = false
      AND v.follow_up_status = 'ativo'
      AND v.follow_up_date IS NOT NULL
      AND v.follow_up_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
    RETURNING v.id
  )
  SELECT count(*) INTO afetados FROM movidos;
  RETURN afetados;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expirar_follow_ups_para_balde() TO authenticated, service_role;