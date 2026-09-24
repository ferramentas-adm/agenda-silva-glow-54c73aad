ALTER TABLE public.closer_blocks REPLICA IDENTITY FULL;
ALTER TABLE public.closer_block_exceptions REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.closer_blocks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.closer_block_exceptions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;