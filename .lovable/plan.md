## Mudanças em `src/pages/DashboardPage.tsx`

1. **Reverter `totalSdrCount`** para somar todos os status (`TOTAL_STATUSES`), como era antes.

2. **`Total agend. dia`** passa a ser `totalSdrCount + closerCreatedCount` (SDR todos status + 2ª reunião todos status), em vez de só `agendada+confirmada` do `sourceCounts`.

3. **`Ainda a real. dia`** continua = `totalAgend - sourceTotal`, mas agora usa o novo `totalAgend`.

Resultado esperado: hoje 37 SDR + 1 Closer = 38 no Total agend. dia.

Obs: na visão de closer (`isCloserView`), o card "Total agend. dia" usa só a contagem do próprio closer (`closerOwnStatusCounts` agendada+confirmada) — mantém o comportamento atual dessa view.