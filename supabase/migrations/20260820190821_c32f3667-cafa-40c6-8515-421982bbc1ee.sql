-- Índices para closer_blocks (hoje sofre seq scan em toda consulta de agenda)
CREATE INDEX IF NOT EXISTS idx_closer_blocks_block_date
  ON public.closer_blocks (block_date)
  WHERE is_recurring = false;

CREATE INDEX IF NOT EXISTS idx_closer_blocks_weekday
  ON public.closer_blocks (recurrence_weekday)
  WHERE is_recurring = true;

-- Rotina de retenção (execução manual, apenas gestor)
CREATE OR REPLACE FUNCTION public.limpar_registros_antigos()
RETURNS TABLE(audit_logs_removidos bigint, notificacoes_removidas bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs bigint := 0;
  v_notif bigint := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'gestor'::app_role) THEN
    RAISE EXCEPTION 'Apenas gestores podem executar a limpeza de registros antigos.';
  END IF;

  DELETE FROM public.audit_logs
  WHERE created_at < now() - interval '6 months';
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  DELETE FROM public.notifications
  WHERE read_at IS NOT NULL
    AND created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_notif = ROW_COUNT;

  RETURN QUERY SELECT v_logs, v_notif;
END;
$$;

REVOKE ALL ON FUNCTION public.limpar_registros_antigos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_registros_antigos() TO authenticated;