DO $$
DECLARE v_marker text;
BEGIN
  CREATE TABLE public._trg_check (id serial primary key, v text, touched text);

  CREATE FUNCTION public._trg_check_fn() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
  BEGIN NEW.touched := 'trigger-ok'; RETURN NEW; END; $f$;

  CREATE TRIGGER t BEFORE INSERT ON public._trg_check
    FOR EACH ROW EXECUTE FUNCTION public._trg_check_fn();

  -- mesma configuração que apliquei nas funções de gatilho reais
  REVOKE EXECUTE ON FUNCTION public._trg_check_fn() FROM PUBLIC, anon, authenticated;
  GRANT INSERT, SELECT ON public._trg_check TO authenticated;
  GRANT USAGE, SELECT ON SEQUENCE public._trg_check_id_seq TO authenticated;

  SET LOCAL ROLE authenticated;
  INSERT INTO public._trg_check (v) VALUES ('x');
  SELECT touched INTO v_marker FROM public._trg_check LIMIT 1;
  RESET ROLE;

  RAISE NOTICE 'RESULTADO DO TESTE: %', coalesce(v_marker, 'FALHOU - gatilho nao disparou');
  IF coalesce(v_marker, '') <> 'trigger-ok' THEN
    RAISE EXCEPTION 'REGRESSAO: gatilho nao disparou para authenticated apos REVOKE EXECUTE';
  END IF;

  DROP TABLE public._trg_check CASCADE;
  DROP FUNCTION public._trg_check_fn();
END $$;