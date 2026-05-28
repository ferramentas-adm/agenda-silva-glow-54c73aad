## Refatorar cards do `DashboardPage.tsx`

Todos os cards passam a contar **todas as agendas do dia** (SDR + 2ª reunião), e não só SDR. Os cards "Total Closers" e "Closer Realizada" continuam isolando a fatia 2ª reunião.

### Cards

| Card | Cálculo |
|---|---|
| **Total agend. dia** | `filtered.length` — todos os status (agendada, confirmada, realizada, cancelada, no_show, reagendada). Ícone trocado de `Clock` → `CalendarDays`. |
| **Total real. dia** | status = `realizada` (todas). |
| **Ainda a real. dia** | status ∈ (`agendada`, `confirmada`) com filtro de horário: <br>• data < hoje → `0` <br>• data > hoje → todas agendada+confirmada <br>• data = hoje → `scheduled_time >= próxima hora cheia` (ex.: 10:49 → ≥ 11:00; 11:15 → ≥ 12:00). <br>Recalcula a cada minuto. |
| **Sem confirmar** | status = `agendada` (todas). |
| **Confirmadas** | status = `confirmada` (todas). |
| **Realizadas** | status = `realizada` (todas). |
| **Canceladas / No-shows / Reagendadas / Não comparecimento** | mesma lógica atual, mas agora sobre todas as agendas do dia (não só SDR). |
| **Total Closers** | mantém: 2ª reunião, todos os status. |
| **Closer Realizada** | mantém: 2ª reunião, status `realizada`. |

### Visão Closer (`isCloserView`)

Continua usando `closerOwnStatusCounts` (só as agendas do próprio closer). A lógica de `Ainda a real. dia` com filtro de horário se aplica igualmente.

### Implementação

- Criar `allStatusCounts` (filtered reduzido por status efetivo, sem filtrar por SDR/2ª).
- Substituir `sourceCounts` no admin/mod/sdr view por `allStatusCounts`.
- Criar helper `aindaARealCount(counts, agendamentos, currentDate, now)` que aplica o filtro de horário.
- Estado `now` atualizado por `setInterval` de 60s para o card de "Ainda a real. dia" reagir à passagem da hora.

Nada muda no schema nem em `AgendarPage`.