CREATE OR REPLACE FUNCTION public.guard_venda_somente_gestor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'moderador') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.vendeu THEN RAISE EXCEPTION 'Somente gestor/admin pode lançar venda.' USING ERRCODE = '42501'; END IF;
  ELSIF NEW.vendeu IS DISTINCT FROM OLD.vendeu
     OR (NEW.vendeu AND (NEW.valor IS DISTINCT FROM OLD.valor
        OR NEW.valor_total_projeto IS DISTINCT FROM OLD.valor_total_projeto
        OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
        OR NEW.produto IS DISTINCT FROM OLD.produto)) THEN
    RAISE EXCEPTION 'Somente gestor/admin pode lançar ou alterar venda.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_venda_somente_gestor ON public.vendas;
CREATE TRIGGER trg_guard_venda_somente_gestor BEFORE INSERT OR UPDATE ON public.vendas
FOR EACH ROW EXECUTE FUNCTION public.guard_venda_somente_gestor();