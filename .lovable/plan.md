# Coluna de reagendamentos no Ranking de SDRs

## O que muda

No "Ranking de Performance — SDRs", quando a métrica ativa é **Criadas**, a tabela ganha duas colunas:

- **Reagend.** — quantidade de reagendamentos que o SDR fez no período (agendas com origem em outra agenda, contadas pela data em que foram criadas).
- **Total geração** — soma de agendas novas + reagendamentos.

A **posição no ranking** (1º, 2º, 3º…) passa a ser calculada pelo **Total geração**, e a **Média/dia** passa a usar esse mesmo total. Exemplo: Jonatas Silva com 8 novas + 4 reagendamentos = 12 de total geração.

Nas métricas "Para" e "Compareceu" nada muda — as colunas novas não aparecem e o ranking continua como hoje.

## Detalhes técnicos

Arquivo: `src/pages/DashboardComercialPage.tsx`, componente `RankingSDRsTab`.

- Nova função `reagendadasFor(sdrId, range)`: filtra `createdAgs` por `sdrOf(a) === sdrId`, `a.original_agendamento_id != null` e `localDateOf(a.created_at)` dentro do range — exatamente o complemento do filtro atual de "criadas".
- `ranking` passa a computar `reagendadas` e `totalGeracao = total + reagendadas` (apenas quando `metricType === "criadas"`; nas outras métricas `reagendadas = 0` e `totalGeracao = total`), e ordena por `totalGeracao` decrescente.
- Colunas `Reagend.` e `Total geração` renderizadas só quando `metricType === "criadas"`; `colSpan` do estado vazio ajustado.
- Média/dia e `getPosition` usam `totalGeracao`.
- Sem alterações de banco, RPC ou queries — os reagendamentos já vêm no pool `createdAgs`.
