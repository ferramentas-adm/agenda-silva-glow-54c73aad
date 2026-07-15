
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_gestor()',
    'public.is_manager()',
    'public.is_manager_or_sdr()',
    'public.is_manager_or_apresentador()',
    'public.is_closer()',
    'public.current_closer_id()'
  ]
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
