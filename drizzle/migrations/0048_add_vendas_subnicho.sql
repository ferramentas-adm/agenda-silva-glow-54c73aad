ALTER TABLE public.vendas ADD COLUMN subnicho text;
COMMENT ON COLUMN public.vendas.subnicho IS 'Subnicho da mentoria do cliente, informado pelo closer no desfecho da reunião.';