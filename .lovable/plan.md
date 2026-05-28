## Correção: Total agend. dia incluindo canceladas

**Problema:** O card "Total agend. dia" soma todos os agendamentos (incluindo `cancelada`), enquanto "Agendas pra Hoje" e "Total Closers" filtram canceladas. Por isso a soma não bate.

- Hoje: 40 SDR + 2 Closer + 2 canceladas SDR = 44
- Ontem: 69 + 7 + 2 canceladas = 78

Sim, é exatamente o mesmo bug e a correção resolve os dois dias (e qualquer outro).

### Mudança

`src/pages/DashboardPage.tsx` (~linha 747):

```ts
const totalAgend = sourceAgendamentos.filter(a => a.status !== "cancelada").length;
```

Depois disso: "Total agend. dia" = SDRs visíveis + Closers, batendo com a soma exibida.