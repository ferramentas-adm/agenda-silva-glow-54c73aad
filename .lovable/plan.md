# Prompt de exportação: abas "Vendas" e "Saldo Residual" para o projeto Grupo VR

Copie o texto abaixo (do bloco inteiro) e cole como mensagem no projeto Grupo VR.

---

## PROMPT PARA COLAR NO PROJETO GRUPO VR

Quero replicar, dentro do meu Dashboard Comercial, duas abas que já existem em outro painel meu: **Vendas** e **Saldo Residual**. Antes de codar, confira o meu schema atual (`agendamentos`, `vendas`, `closers`, `user_roles`, `profiles`) e adapte nomes de colunas/papéis quando divergirem — não invente colunas.

### Contexto do modelo de dados esperado

- `agendamentos`: `id`, `closer_id`, `sdr_responsavel_id`, `scheduled_date` (date), `scheduled_time` (HH:mm), `lead_name`, `lead_phone`, `channel_type`, `status` (inclui `realizada`), `meeting_reason` (pode ser `segunda_reuniao`), `is_venda_avulsa` (boolean), `deleted_at`.
- `vendas`: `id`, `agendamento_id` (FK), `vendeu` (bool), `valor` (coletado na venda), `valor_total_projeto` (faturado total negociado), `produto`, `order_bumps` (jsonb), `follow_up`, `follow_up_date`, `follow_up_time`, `segunda_reuniao`, `motivo_nao_fechamento`, `observacoes`, `closed_at` (date), `created_at`, `updated_at`.
- Papéis: gestor, moderador, supervisor, apresentador, closer, sdr — via tabela `user_roles` + função `has_role`.
- Fuso: **sempre America/Sao_Paulo**. Datas vindas de `timestamptz` precisam ser convertidas antes de agrupar por dia.

### Parte 1 — Banco de dados (uma migration)

1. Helpers (crie se não existirem, todos com `SET search_path = public`):

```sql
CREATE OR REPLACE FUNCTION public.venda_closing_date(_closed_at date, _updated_at timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(_closed_at, (_updated_at AT TIME ZONE 'America/Sao_Paulo')::date)
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_apresentador()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
      AND role = ANY (ARRAY['gestor','moderador','supervisor','apresentador']::app_role[]))
$$;
```

2. Tabela de pagamentos complementares (aditiva — **não altere `vendas`**):

```sql
CREATE TABLE public.venda_complementos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  valor numeric NOT NULL,
  data_pagamento date NOT NULL,
  observacoes text,
  criado_por uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venda_complementos TO authenticated;
GRANT ALL ON public.venda_complementos TO service_role;

ALTER TABLE public.venda_complementos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view venda_complementos"
  ON public.venda_complementos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Managers can insert venda_complementos"
  ON public.venda_complementos FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_apresentador() AND criado_por = (SELECT auth.uid()));
CREATE POLICY "Managers can update venda_complementos"
  ON public.venda_complementos FOR UPDATE TO authenticated
  USING (public.is_manager_or_apresentador()) WITH CHECK (public.is_manager_or_apresentador());
CREATE POLICY "Managers can delete venda_complementos"
  ON public.venda_complementos FOR DELETE TO authenticated
  USING (public.is_manager_or_apresentador());

CREATE INDEX idx_venda_complementos_venda ON public.venda_complementos (venda_id);
CREATE INDEX idx_venda_complementos_data ON public.venda_complementos (data_pagamento);
CREATE TRIGGER update_venda_complementos_updated_at BEFORE UPDATE ON public.venda_complementos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

3. RPCs de agregação (todas `LANGUAGE sql STABLE SET search_path = public` + `GRANT EXECUTE ... TO authenticated`). O client nunca deve baixar linhas cruas para calcular KPI.

- `dashboard_vendas_kpis(p_from date, p_to date, p_closer_id uuid default null)` → `vendas_calls, vendas_avulsas, coletado_calls, coletado_avulsa, faturado_calls, faturado_avulsa, vendas_primeira_call, vendas_follow, nao_fechou, ofertas_preco, vendas_sem_status_realizada`. Vendas fechadas são atribuídas por `venda_closing_date(v.closed_at, v.updated_at) BETWEEN p_from AND p_to` (nunca pela data da reunião); perdidas são `NOT vendeu` com agendamento `status='realizada'` e `scheduled_date` no período. Faturado usa `COALESCE(valor_total_projeto, valor, 0)`.
- `dashboard_conversao_period(p_from, p_to, p_closer_id)` → `total_reunioes, total_vendas, ids uuid[]`. Denominador: reuniões `status='realizada'`, `deleted_at IS NULL`, não avulsas, `meeting_reason <> 'segunda_reuniao'`, `scheduled_date` no período. Numerador: última venda por agendamento com `vendeu`, mais vendas de 2ª reunião ligadas por `original_agendamento_id` ou pelo telefone normalizado. Use CTEs `MATERIALIZED` (sem isso a função passa de 13s em um mês).
- `dashboard_vendas_closer_perf(p_from, p_to, p_channel text default null, p_closer_id uuid default null)` → `closer_id, realizadas, vendas, receita`, com `FULL OUTER JOIN` para incluir closers que realizaram e não venderam. Conversão do closer = vendas / realizadas.
- `dashboard_vendas_motivos(p_from, p_to, p_closer_id, p_channel, p_preco)` → `motivo, qtd, total_nao_fechou`.
- `dashboard_vendas_realizadas_sem_closer(p_from, p_to)` → int.
- `dashboard_saldo_residual(p_closer_id uuid, p_order text, p_limit int, p_offset int, p_from date)` → `venda_id, agendamento_id, lead_name, closer_id, closer_name, produto, closed_at, faturado, coletado_base, complementos_total, coletado_acumulado, saldo, qtd_complementos, is_venda_avulsa`. Base: `vendas v JOIN agendamentos a` (`vendeu`, `a.deleted_at IS NULL`, `COALESCE(valor_total_projeto,0) > 0`), `LEFT JOIN LATERAL` somando `venda_complementos`; filtra `saldo = faturado - coletado_base - complementos_total > 0`; ordena por `saldo DESC` ou `closed_at ASC` conforme `p_order` (`'saldo'` | `'antiga'`); paginado.
- `dashboard_saldo_residual_totais(p_closer_id uuid, p_from date)` → `total_faturado, total_coletado_acumulado, total_saldo, qtd_vendas` (mesmos filtros).
- `dashboard_complementos_periodo(p_from date, p_to date, p_closer_id uuid)` → `total, qtd` por `data_pagamento` no intervalo.

### Parte 2 — Aba "Vendas" (`VendasTab.tsx`)

Componente recebe `currentDate: Date` e `dateRange?: DateRange` (dia único = from/to iguais) e mostra rótulo amigável (Hoje/Ontem/Amanhã/intervalo). Todos os KPIs vêm de RPC; listas usam paginação de 1.000 linhas (`fetchAllPages`) quando precisar de linhas.

KPIs (cards clicáveis, abrem drilldown com a lista de leads):
`Taxa de Conversão`, `Coletado Total`, `Coletado Médio`, `Vendas Fechadas`, `Follow-ups Ativos`, `Complementos Recebidos` (soma de complementos por `data_pagamento` no período), `Saldo a Receber` (total geral, independente do período), `Vendas em 1ª Call`.

Blocos abaixo dos KPIs:
- Lista de vendas do período (editar venda, excluir com justificativa, exportar CSV com textos longos buscados só no download, botão de ligar para o lead).
- Motivos de não fechamento (gráfico + filtros por closer, canal e "apresentou preço").
- Performance por Closer, com ordenação por conversão, coletado, vendas e realizadas — incluindo quem realizou e não vendeu.
- Card "Conversão por hora" (07h–23h, vendas de 1ª call sobre reuniões realizadas na mesma hora, com comparativos de período anterior/últimas semanas) — visível só para gestor/supervisor/moderador.
- Botão "Nova venda avulsa" (gestor): venda fechada fora da call para lead que já teve reunião; o campo Nome busca leads existentes em `agendamentos` e autopreenche telefone, closer, SDR e canal.
- Drilldown de venda (`MetricDrilldownDialog`) com botão "Lançar complemento".

### Parte 3 — Aba "Saldo Residual"

Nova aba no Dashboard Comercial (`gestorOnly`), visível para gestor/moderador/supervisor/apresentador:
- Três cartões de topo: Faturado (vendas com saldo), Coletado acumulado, Saldo a receber (+ qtd de vendas em aberto).
- Lista paginada (50/página) via `dashboard_saldo_residual`: lead, selos "Avulsa"/produto/nº de complementos, closer e data de fechamento; à direita Faturado, Coletado (verde), Saldo (âmbar) e botão "Complemento".
- Ordenação "maior saldo" / "mais antiga" e busca por nome do lead.
- Constante exportada `SALDO_RESIDUAL_FROM` (ex.: `"2026-08-01"`) enviada como `p_from` para limitar a lista/totais a vendas fechadas a partir dessa data.
- Vendas sem `valor_total_projeto` não aparecem (saldo indeterminado) — deixe isso explícito na tela vazia.

`ComplementoDialog`: campos valor (máscara BRL), data do pagamento (date picker BRT) e observações; histórico de complementos da venda com remover; grava auditoria (`logAudit`) e invalida as queries `saldo-residual-*`, `vendas-tab-*` e `complementos-*`. Só gestor/moderador/supervisor/apresentador consegue lançar (botão oculto + RLS).

### Regras gerais

- React Query com `staleTime: 60s` e `refetchInterval: 5min`.
- Nada de cor hardcoded: use tokens do design system.
- Datas sempre por helpers de timezone (America/Sao_Paulo), nunca `new Date().getHours()` em timestamp do banco.
- Nada de alteração estrutural em `vendas` — tudo aditivo.

### Validação final

Lançar complemento em venda de call e em avulsa (saldo cai, coletado sobe); complemento que zera o saldo remove a venda da lista; closer não consegue lançar; KPIs de Coletado/Faturado batem com a lista de vendas; período de 1 mês carrega rápido.
