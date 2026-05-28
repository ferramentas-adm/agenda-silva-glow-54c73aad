## Diagnóstico

- **Dashboard "Total agend. dia"** (`DashboardPage.tsx`): hoje = `totalSdrCount + closerCreatedCount`, ambos **excluem canceladas**.
- **Métricas SDRs "Agendas Para Hoje" / "Total agend. dia"** (`DashboardComercialPage.tsx`): também **excluem canceladas** (via `*Active`).

Sua regra: as duas devem **incluir canceladas**, e a Métricas SDRs continua **só SDR** (sem Closer).

## Plano

### 1. `src/pages/DashboardPage.tsx`

- `totalSdrCount` (linha 364) — remover `a.status !== "cancelada"`.
- `closerCreatedCount` (linha 394) — remover `a.status !== "cancelada"`. Atualizar comentário.
- `totalAgend` isCloserView (linha 743) — remover `.filter(a => a.status !== "cancelada")`, virar `sourceAgendamentos.filter(a => TOTAL_STATUSES.includes(a.status)).length`.

### 2. `src/pages/DashboardComercialPage.tsx` (useMemo ~290-388)

- Remover helper `active()` e as variantes `*Active` (`todayAgsActive`, `todayCreatedActive`, `yesterdayAgsActive`, `tomorrowAgsActive`, `monthAgsActive`, `prevMonthSdrActive`).
- Voltar todos os totais/IDs/`byChannel` para usar as listas completas (`todayAgs`, `todayCreated`, `yesterdayAgs`, `tomorrowAgs`, `monthAgs`, `prevMonthSdr`).
- `totalDia` = `todayAgs.length`.
- `taxaComp` = `compareceuCount / todayAgs.length` (denominador inclui canceladas — fica matematicamente coerente com o total exibido).
- `monthDiff` = `monthAgs.length - prevMonthSdr.length`.

### 3. Sem outras mudanças

Os cards de status (Confirmadas, Canceladas, Realizadas, No-show, Reagendadas) já usavam `todayAgs` cheio — continuam iguais.

## Resultado

Ambos os cards passam a contar canceladas. Como Métricas SDRs ignora Closer e o Dashboard soma Closer, eles **podem diferir** no número absoluto, mas usam a **mesma regra de status** (todas as agendas do dia, inclusive canceladas). Daqui pra frente, mudar a inclusão/exclusão de qualquer status em um deles deve ser feito no outro também.
