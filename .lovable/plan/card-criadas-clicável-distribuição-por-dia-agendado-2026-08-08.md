# Card "Criadas" clicável — distribuição por dia agendado

## O que muda

No card **Criadas** de "Produtividade SDR", o clique passa a abrir um modal mostrando **para quais dias** as agendas criadas no período foram marcadas.

Conteúdo do modal:
- Título: "Criadas em {período} — distribuição por dia agendado".
- Lista de dias (ex.: "sáb, 09/08 — 7 agendas (33%)") ordenada por data crescente, com barra de proporção.
- Linha de total no rodapé.
- Clicar em um dia abre o drilldown já existente com os leads daquele dia (nome, horário, status).

## Detalhes técnicos

- `src/components/dashboard/ProdutividadeSDRTab.tsx`: `SummaryCard` ganha prop opcional `onClick` (cursor pointer + hover) usada apenas no card Criadas.
- Reaproveitar exatamente o mesmo conjunto usado no KPI `kpis.criadas` (filtro `createdAgs` por `localDateOf(created_at)` no range, sem reagendamentos, com SDR atribuível) e agrupar por `scheduled_date`.
- Novo componente `src/components/dashboard/CriadasPorDiaDialog.tsx` (Dialog do shadcn) recebendo a lista agrupada + `periodLabel`.
- O clique num dia abre `MetricDrilldownDialog` já existente passando os `agendamentoIds` do dia.
- Sem mudanças no banco nem em regras de cálculo.
