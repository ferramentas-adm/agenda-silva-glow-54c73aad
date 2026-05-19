## Ajuste de rótulos no drilldown (reagendamentos)

Em `src/components/dashboard/MetricDrilldownDialog.tsx`, no card de cada agendamento:

Quando o agendamento tem `original_agendamento_id` (foi reagendado), mostrar apenas duas linhas de data no lugar das atuais "Agendado em …" e "Reagendado de …":

- **Agendado primeira vez em: DD/MM às HH:MM** — usa `scheduled_date` + `scheduled_time` do agendamento **original** (via `originalMap`).
- **Reagendado para: DD/MM às HH:MM** — usa `scheduled_date` + `scheduled_time` do agendamento atual.

Quando NÃO há reagendamento (sem `original_agendamento_id`), manter o comportamento atual: linha única "Criado em DD/MM/AAAA às HH:MM" usando `created_at` (renomear de "Agendado em" para "Criado em" para não confundir com horário da reunião).

A linha do topo (ícone de relógio com `scheduled_date` + `scheduled_time`) continua igual.

Sem mudanças de backend.
