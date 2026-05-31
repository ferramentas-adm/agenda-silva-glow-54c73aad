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
      OR public.has_role(auth.uid(),'sdr'::app_role)
    ) THEN
      RAISE EXCEPTION 'Apenas gestores, moderadores e SDRs podem excluir agendamentos';
    END IF;
  END IF;
  RETURN NEW;
END $function$;