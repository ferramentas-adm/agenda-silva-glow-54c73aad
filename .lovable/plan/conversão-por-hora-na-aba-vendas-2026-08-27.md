# Conversão por hora na aba Vendas

## O que muda

Novo card na aba **Vendas**, no mesmo estilo do "Produtividade por hora" dos SDRs, mostrando hora a hora (07h–23h, horário da reunião em BRT):

- **Reuniões realizadas** por hora (barra) — apenas status `realizada`, não excluídas, dentro do período do filtro da página.
- **Vendas** por hora (barra) — a venda é contada na hora da reunião do lead. Só vendas de **1ª call** (follow-up e vendas fechadas depois ficam de fora).
- **Taxa de conversão por hora** (linha) = vendas / reuniões realizadas naquela hora, recalculada em tempo real com os dados carregados (ex.: 10 realizadas às 15h com 3 vendas → 30%).
- Vendas avulsas entram pelo horário registrado no agendamento.
- Comparativo igual ao card dos SDRs: botões **Período anterior / Última semana / Média 2, 3 e 4 últimas** (os modos por dia da semana só habilitam quando o filtro está em um único dia), com linha tracejada de comparação.
- Alternância **Hora a hora / Acumulado**, destaques de melhor e pior hora vs comparação, e tabela abaixo do gráfico com Hora, Realizadas, Vendas, Conversão % e Δ vs comparação.
- Card visível apenas para **Gestor, Supervisor e Moderador**; não aparece para closer.

## Detalhes técnicos

- Novo componente `src/components/dashboard/ConversaoPorHoraCard.tsx` (estrutura espelhada em `ProdutividadePorHoraCard.tsx`: `ComposedChart`, mesmos tokens de cor, mesmos modos de comparação).
- Nova query em `src/components/dashboard/VendasTab.tsx` (`react-query`, `refetchInterval` 5 min / `staleTime` 60s) sobre `agendamentos`: `select id, scheduled_date, scheduled_time, closer_id, is_venda_avulsa`, filtros `status = 'realizada'`, `deleted_at is null`, `scheduled_date` cobrindo o período do filtro **mais** as janelas de comparação (período anterior equivalente e até 4 semanas atrás), com paginação de 1.000 linhas.
- Vendas por hora: query em `vendas` restrita ao mesmo intervalo de `agendamentos.scheduled_date`, `vendeu = true`, `agendamentos.deleted_at is null`, `agendamentos.status = 'realizada'`; filtro de 1ª call por `venda_origem <> 'follow_up'` (tratando nulo como 1ª call) e `follow_up`/`segunda_reuniao` falsos. Agrupamento pela hora de `agendamentos.scheduled_time`.
- Hora derivada de `scheduled_time` (`HH:mm`, já em BRT) — sem conversão de fuso; datas de comparação calculadas com `pickedDateToYMD` de `src/lib/timezone.ts`, como no card dos SDRs.
- Gate de papel via `usePermissions`/`role` (mesmo critério já usado para cards de gestão), renderizando o card só para gestor/supervisor/moderador.
- Sem mudanças de banco e sem alteração nos cards existentes (Taxa de Conversão geral, Performance por Closer, Performance por Produto seguem iguais).
