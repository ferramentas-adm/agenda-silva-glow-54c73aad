## Badge "Preço ofertado / Sem oferta" em todas as listas de reuniões

Adicionar uma nova badge ao lado do status indicando se houve apresentação de preço, usando a mesma regra do KPI "Oferta de Preço":

- **Preço ofertado** (verde, sutil) — `venda.vendeu === true` **ou** `Number(venda.valor) > 0`
- **Sem oferta** (outline cinza) — caso contrário, **apenas para reuniões `realizada`** (em `agendada`/`cancelada`/`no_show` a badge não aparece para não poluir).

### Locais afetados

1. **`src/components/dashboard/MetricDrilldownDialog.tsx`** — drilldown dos cards do Dashboard Comercial (ex.: "Reuniões com resultado — Hoje"). Adicionar a badge no cabeçalho de cada card, ao lado de "Follow ativo / Sem follow". Campo `valor` já está no `select` da query `drilldown-vendas`.

2. **`src/pages/ReunioesListPage.tsx`** — tabela principal de Reuniões. Estender a query de vendas (linha ~110/185) para trazer `agendamento_id` + `valor` + `vendeu` de todas as reuniões `realizada` visíveis, montar um `Map<agendamento_id, { vendeu, valor }>`, e renderizar a badge na célula de Status (logo abaixo ou ao lado do badge de status existente, linha ~653).

Sem mudanças no schema/backend. Nenhuma outra alteração de comportamento.
