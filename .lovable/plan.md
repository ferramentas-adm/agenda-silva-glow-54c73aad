# Reagendamento vs. Nova Reunião — lógica a partir de hoje

## Decisão
Nada de correção retroativa. O histórico anterior a hoje (25/08/2026) fica exatamente como está. A nova regra vale apenas para agendamentos criados de hoje em diante.

## Como o sistema passa a classificar

Quando um SDR cria um agendamento para um lead que já tinha reunião anterior:

- A nova agenda só é marcada como **Reagendamento** se a reunião anterior do mesmo lead ainda estiver **agendada** ou **confirmada** (ou seja, é realmente um remanejamento de horário de algo que ainda ia acontecer).
- Se a reunião anterior estiver como **no-show**, **cancelada** ou **reagendada**, a nova agenda conta como **Nova reunião**. É recuperação de lead, produção nova do SDR.
- Se a reunião anterior já estiver **realizada**, também conta como nova reunião (comportamento que já existia).
- Reagendamento explícito feito pela própria tela de reagendar continua sendo reagendamento, independentemente disso.

Consequência prática: leads resgatados por ligação após no-show/cancelamento passam a somar em "Criadas" no ranking dos SDRs.

## Ranking de Performance — SDRs

Com a métrica "Criadas" selecionada, a tabela ganha duas colunas:

- **Reagend.** — reagendamentos criados dentro do período (contados pela data de criação).
- **Total geração** — novas + reagendamentos.

A posição no ranking e a média diária passam a usar o **Total geração**. Nas outras métricas (realizadas, etc.) a tabela segue como está hoje.

## Detalhes técnicos

- O gatilho `public.detect_and_mark_reschedule()` já foi ajustado para só vincular `original_agendamento_id` quando o agendamento anterior está em `agendada`/`confirmada`. Nenhuma nova migração é necessária.
- Não será executado nenhum `UPDATE` de limpeza histórica em `agendamentos` (as ~16 vinculações inválidas de 25/08 e as de agosto permanecem como estão).
- Frontend: `src/pages/DashboardComercialPage.tsx`, componente `RankingSDRsTab` — derivar `reagendamentos` a partir de `original_agendamento_id IS NOT NULL` no conjunto já carregado por data de criação, calcular `totalGeracao`, ordenar por ele e renderizar as duas colunas apenas quando `metricType === "criadas"`.
