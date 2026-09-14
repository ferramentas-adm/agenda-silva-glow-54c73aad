ALTER TABLE public.agendamentos
ADD COLUMN IF NOT EXISTS lembrete_video_enviado timestamp with time zone;

COMMENT ON COLUMN public.agendamentos.lembrete_video_enviado IS
  'Primeiro instante em que um lembrete de 24h ou 1h com o link do vídeo preparatório foi enviado.';