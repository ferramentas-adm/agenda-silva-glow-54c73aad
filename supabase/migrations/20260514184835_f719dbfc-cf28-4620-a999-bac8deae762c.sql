CREATE POLICY "Gestors and moderators can delete vendas"
ON public.vendas
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'gestor'::app_role) 
  OR has_role(auth.uid(), 'moderador'::app_role)
);

DROP POLICY IF EXISTS "Gestors can delete vendas" ON public.vendas;