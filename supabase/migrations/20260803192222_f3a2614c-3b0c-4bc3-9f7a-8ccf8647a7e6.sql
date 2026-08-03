-- 1) search_path fixo
ALTER FUNCTION public.notify_status_change_webhook() SET search_path = public;

-- 2) revoga execute de anon em funções SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.get_public_profiles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clear_followup_on_segunda_reuniao_sale() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_pending_closer_assignment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_conversao_period(date, date, uuid) FROM anon;

-- 3) políticas de storage.objects restritas a gestores
DROP POLICY IF EXISTS "Gestores podem ver arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Gestores podem enviar arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Gestores podem atualizar arquivos" ON storage.objects;
DROP POLICY IF EXISTS "Gestores podem excluir arquivos" ON storage.objects;

CREATE POLICY "Gestores podem ver arquivos"
ON storage.objects FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores podem enviar arquivos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores podem atualizar arquivos"
ON storage.objects FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY "Gestores podem excluir arquivos"
ON storage.objects FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::public.app_role));