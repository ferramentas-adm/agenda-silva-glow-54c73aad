CREATE TABLE public.sdr_downsell (
  telefone text PRIMARY KEY,
  nome text,
  email text,
  form_id text,
  form_at timestamptz,
  origem text NOT NULL DEFAULT 'formulario',
  utm_content text,
  etapa text NOT NULL DEFAULT 'novo',
  pagina_vista_em timestamptz,
  clicou_em timestamptz,
  enviado_em timestamptz,
  respondeu_em timestamptz,
  comprou_em timestamptz,
  pedido_id text,
  oferta_expira_em timestamptz,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sdr_downsell_telefone_check CHECK (telefone ~ '^[0-9]{10,11}$'),
  CONSTRAINT sdr_downsell_etapa_check CHECK (etapa IN ('novo', 'clicou', 'enviado', 'respondeu', 'comprou', 'expirado'))
);

GRANT ALL ON public.sdr_downsell TO service_role;

ALTER TABLE public.sdr_downsell ENABLE ROW LEVEL SECURITY;

CREATE INDEX sdr_downsell_etapa_idx ON public.sdr_downsell (etapa);
CREATE INDEX sdr_downsell_form_at_idx ON public.sdr_downsell (form_at);

CREATE TRIGGER update_sdr_downsell_updated_at
BEFORE UPDATE ON public.sdr_downsell
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sdr_downsell_rate_limits (
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_start),
  CONSTRAINT sdr_downsell_rate_count_check CHECK (request_count BETWEEN 1 AND 60)
);

GRANT ALL ON public.sdr_downsell_rate_limits TO service_role;

ALTER TABLE public.sdr_downsell_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX sdr_downsell_rate_limits_created_at_idx
ON public.sdr_downsell_rate_limits (created_at);

CREATE OR REPLACE FUNCTION public.consume_sdr_downsell_rate_limit(_ip_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _accepted boolean := false;
  _window timestamptz := date_trunc('minute', now());
BEGIN
  DELETE FROM public.sdr_downsell_rate_limits
  WHERE created_at < now() - interval '24 hours';

  INSERT INTO public.sdr_downsell_rate_limits (ip_hash, window_start, request_count)
  VALUES (_ip_hash, _window, 1)
  ON CONFLICT (ip_hash, window_start) DO UPDATE
  SET request_count = public.sdr_downsell_rate_limits.request_count + 1
  WHERE public.sdr_downsell_rate_limits.request_count < 60
  RETURNING true INTO _accepted;

  RETURN COALESCE(_accepted, false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_sdr_downsell_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_sdr_downsell_rate_limit(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_sdr_downsell_event(
  _telefone text,
  _evento text,
  _nome text DEFAULT NULL,
  _utm_content text DEFAULT NULL,
  _form_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _evento = 'pagina' THEN
    INSERT INTO public.sdr_downsell (
      telefone, nome, form_id, utm_content, pagina_vista_em, oferta_expira_em
    ) VALUES (
      _telefone, _nome, _form_id, _utm_content, now(), now() + interval '24 hours'
    )
    ON CONFLICT (telefone) DO UPDATE SET
      nome = COALESCE(EXCLUDED.nome, public.sdr_downsell.nome),
      form_id = COALESCE(EXCLUDED.form_id, public.sdr_downsell.form_id),
      utm_content = COALESCE(EXCLUDED.utm_content, public.sdr_downsell.utm_content),
      pagina_vista_em = now(),
      oferta_expira_em = COALESCE(public.sdr_downsell.oferta_expira_em, now() + interval '24 hours');
  ELSIF _evento = 'clique' THEN
    INSERT INTO public.sdr_downsell (
      telefone, nome, form_id, utm_content, etapa, clicou_em
    ) VALUES (
      _telefone, _nome, _form_id, _utm_content, 'clicou', now()
    )
    ON CONFLICT (telefone) DO UPDATE SET
      nome = COALESCE(EXCLUDED.nome, public.sdr_downsell.nome),
      form_id = COALESCE(EXCLUDED.form_id, public.sdr_downsell.form_id),
      utm_content = COALESCE(EXCLUDED.utm_content, public.sdr_downsell.utm_content),
      etapa = 'clicou',
      clicou_em = now();
  ELSE
    RAISE EXCEPTION 'evento_invalido';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_sdr_downsell_event(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sdr_downsell_event(text, text, text, text, text) TO service_role;