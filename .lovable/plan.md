## Mudanças em `src/pages/DashboardPage.tsx`

1. **Remover `nowTick` e o `setInterval` de 60s** (linhas 165-170) — não é mais necessário.

2. **Simplificar `aindaReal`** (linhas 755-771) para apenas:

```ts
const aindaReal = (sourceCounts["agendada"] ?? 0) + (sourceCounts["confirmada"] ?? 0);
```

Sem filtro de horário, sem `brTodayYMD`/`brPartsOf`/`format(currentDate, …)` aqui.

3. Se `brTodayYMD` e `brPartsOf` ficarem sem uso após a mudança, removo os imports.