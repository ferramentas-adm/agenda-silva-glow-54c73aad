## Mudança

No `src/pages/DashboardPage.tsx`, alterar `totalSdrCount` (linha 368-371) para contar apenas `agendada` + `confirmada` (em vez de `TOTAL_STATUSES`).

Resultado: o card "Agendas pra Hoje" (SDR) vai bater com o "Total agend. dia".

```ts
const totalSdrCount = useMemo(
  () => filtered.filter(
    (a) => (a.status === "agendada" || a.status === "confirmada") && isSdrAgenda(a)
  ).length,
  [filtered, userRolesMap]
);
```

Nada mais muda — `closerCreatedCount`, `closerRealizadaCount` e os cards de status continuam iguais.