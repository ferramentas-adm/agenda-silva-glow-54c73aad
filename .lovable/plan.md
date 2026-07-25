## Objetivo

Corrigir dois cálculos de taxa de conversão no Dashboard Comercial.

## 1. Card "Taxa de Conversão" (aba Vendas)

Hoje: numerador = vendas dos agendamentos realizados no período, incluindo vendas registradas em agendamentos de 2ª reunião que ocorreram no período (13 de 86 = 15,1%).

Novo comportamento:
- Uma venda sempre conta na data da **primeira call daquele lead**, não na data da 2ª reunião/follow-up.
- Vendas fechadas via follow-up ou 2ª reunião passam a atualizar a conversão do dia da 1ª reunião (dias anteriores), não do dia atual.
- Reuniões marcadas como 2ª reunião deixam de entrar no denominador do próprio dia (não são calls novas), evitando penalizar a taxa do dia.

Como será feito (RPC `dashboard_conversao_period`):
- Denominador: agendamentos `realizada`, não avulsos, `scheduled_date` no período, **excluindo** `meeting_reason = 'segunda_reuniao'` e excluindo Call Interrompida (regra atual mantida).
- Numerador: para cada agendamento do denominador, considera vendida se:
  - existe venda `vendeu = true` no próprio agendamento (independente de quando foi fechada), **ou**
  - existe venda `vendeu = true` em um agendamento de 2ª reunião derivado dele (via `original_agendamento_id`, com fallback por telefone normalizado quando o vínculo não existir), atribuída à data da 1ª call.
- O subtítulo do card passa a explicitar a regra: "vendas atribuídas à data da 1ª call".
- O drill-down do card usa os mesmos ids do denominador/numerador ajustados.

Efeito: o número do dia atual cai (só conta o que era call daquele dia) e dias passados sobem retroativamente quando um follow-up fecha.

## 2. Conversão por canal ("Agendas Para/Criadas — por Canal")

Hoje a coluna Conversão usa `vendas / agendadas`. Passa a usar `vendas / realizadas`, tanto nas linhas quanto na linha TOTAL. Quando `realizadas = 0`, mostra "—".

Arquivo: `src/components/dashboard/AgendasPorCanalPanel.tsx` (função `pct` aplicada sobre `qtdRealizadas` / `totals.qtdRealizadas`).

## Detalhes técnicos

- Migração de banco: `CREATE OR REPLACE FUNCTION public.dashboard_conversao_period(...)` mantendo a mesma assinatura e retorno (`total_reunioes`, `total_vendas`, `ids`), sem mudança de contrato no front.
- `src/components/dashboard/VendasTab.tsx`: apenas ajuste do texto do subtítulo do card; o restante (Coletado, Vendas Fechadas, cards "Vendas registradas") permanece como está, pois esses são por data de registro da venda.
- Nenhum dado é apagado ou alterado; só a forma de agregar.
