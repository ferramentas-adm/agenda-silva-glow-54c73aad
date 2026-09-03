# Saldo Residual: complementos de pagamento no painel comercial

Adição puramente aditiva: a tabela `vendas` não é alterada. Os pagamentos complementares
(parcelas recebidas depois do fechamento) passam a ser lançados pelo comercial, e o painel
mostra Coletado Acumulado e Saldo a Receber.

## Como fica para o usuário

- Nova aba **Saldo Residual** no Dashboard Comercial, ao lado de Vendas (visível para
  gestor/moderador/supervisor/apresentador).
  - Lista as vendas com saldo em aberto: `valor_total_projeto − (valor + complementos) > 0`.
  - Colunas: lead, closer, produto, data de fechamento, faturado, coletado acumulado,
    saldo em aberto, nº de complementos, dias desde o fechamento.
  - Ordenação por **maior saldo** ou **mais antiga**; busca por nome do lead;
    totais no topo (faturado, coletado acumulado, saldo a receber).
  - Cada linha abre o dialog **Lançar complemento** (valor, data do pagamento, observações),
    com o histórico de complementos já lançados (editar/remover).
- Botão **Lançar complemento** também no detalhe de venda do drilldown existente
  (`MetricDrilldownDialog`), para registrar sem sair da tela do lead.
- Dois KPIs novos na aba Vendas, ao lado dos atuais (nenhum KPI existente muda):
  - **Complementos Recebidos** — soma dos complementos com `data_pagamento` no período.
  - **Saldo a Receber** — total geral em aberto (todas as vendas, não só do período).
- Vendas avulsas recebem tratamento idêntico às vendas de call, já que vivem na mesma tabela.

## Banco de dados

Uma migration única:

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

-- Leitura: mesmo padrão da tabela vendas (hoje: qualquer usuário autenticado)
CREATE POLICY "Authenticated can view venda_complementos"
  ON public.venda_complementos FOR SELECT TO authenticated USING (true);

-- Escrita: apenas gestor/moderador/supervisor/apresentador
CREATE POLICY "Managers can insert venda_complementos"
  ON public.venda_complementos FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_apresentador() AND criado_por = (SELECT auth.uid()));
CREATE POLICY "Managers can update venda_complementos"
  ON public.venda_complementos FOR UPDATE TO authenticated
  USING (public.is_manager_or_apresentador())
  WITH CHECK (public.is_manager_or_apresentador());
CREATE POLICY "Managers can delete venda_complementos"
  ON public.venda_complementos FOR DELETE TO authenticated
  USING (public.is_manager_or_apresentador());

CREATE INDEX idx_venda_complementos_venda ON public.venda_complementos (venda_id);
CREATE INDEX idx_venda_complementos_data ON public.venda_complementos (data_pagamento);

CREATE TRIGGER update_venda_complementos_updated_at
  BEFORE UPDATE ON public.venda_complementos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

Observação: `is_manager()` já cobre gestor/moderador/supervisor; usamos
`is_manager_or_apresentador()` para incluir apresentador, como pedido.

### RPCs (agregação no banco, nada de baixar linhas cruas)

Todas `SECURITY INVOKER` + `STABLE` + `SET search_path = public` + `GRANT EXECUTE ... TO authenticated`,
seguindo o padrão de `dashboard_vendas_kpis`:

1. `dashboard_saldo_residual(p_closer_id uuid, p_order text, p_limit int, p_offset int)`
   → `venda_id, agendamento_id, lead_name, closer_id, closer_name, produto, closed_at,
   faturado, coletado_base, complementos_total, coletado_acumulado, saldo, qtd_complementos, is_venda_avulsa`.
   Implementação: `vendas v` (com `vendeu = true`, `valor_total_projeto > 0`)
   `LEFT JOIN LATERAL (SELECT coalesce(sum(valor),0) t, count(*) n FROM venda_complementos c WHERE c.venda_id = v.id)`,
   join em `agendamentos`/`closers` para nome, filtro `saldo > 0` via `HAVING`/subquery,
   ordenação por `saldo DESC` ou `closed_at ASC` conforme `p_order`, paginado.
2. `dashboard_saldo_residual_totais(p_closer_id uuid)`
   → `total_faturado, total_coletado_acumulado, total_saldo, qtd_vendas` (uma linha; alimenta o
   KPI "Saldo a Receber" e o cabeçalho da aba).
3. `dashboard_complementos_periodo(p_from date, p_to date, p_closer_id uuid)`
   → `total numeric, qtd int` por `data_pagamento` no intervalo (KPI "Complementos Recebidos").

Assim o client nunca recebe mais do que a página visível (50 linhas) + duas linhas de agregado.

## Arquivos

Novos:
- `src/components/dashboard/SaldoResidualTab.tsx` — aba: filtros, ordenação, totais, tabela paginada.
- `src/components/dashboard/ComplementoDialog.tsx` — lançar/editar/remover complemento + histórico
  da venda; usado pela aba e pelo drilldown. Grava `logAudit` em cada ação e invalida as queries
  `saldo-residual-*`, `vendas-tab-*` e `complementos-*`.

Alterados:
- `src/pages/DashboardComercialPage.tsx` — nova `TabKey` `"saldo_residual"` em `TABS`
  (`gestorOnly: true`) e render de `<SaldoResidualTab />`.
- `src/components/dashboard/VendasTab.tsx` — dois `KpiCard` novos alimentados pelas RPCs 2 e 3
  (nenhuma métrica atual tocada).
- `src/components/dashboard/MetricDrilldownDialog.tsx` — botão "Lançar complemento" na venda,
  visível só para gestor/moderador/supervisor/apresentador, abrindo o `ComplementoDialog`.
- `src/integrations/supabase/types.ts` — regenerado automaticamente após a migration.

Datas sempre em America/Sao_Paulo via helpers de `src/lib/timezone.ts`.

## Validação

- Lançar complemento em uma venda de call e em uma avulsa: saldo reduz, coletado acumulado sobe.
- Complemento que zera o saldo faz a venda sair da lista.
- Closer não consegue lançar (botão oculto e RLS bloqueia).
- KPIs de Coletado/Faturado da aba Vendas permanecem idênticos aos de hoje.
- Períodos longos: aba carrega rápido, sem baixar milhares de linhas.
