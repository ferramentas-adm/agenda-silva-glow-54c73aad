## Objetivo

Fazer o total do painel **"Agendas Para {dia} — por Canal"** bater com o KPI **"Total agend. dia"** do Dashboard Comercial.

Regra escolhida: **agendas de SDR** (created_by SDR ou sdr_responsavel_id preenchido), **excluindo segundas reuniões**, **mantendo reagendadas** (originais que ficaram no dia).

## Diagnóstico

Hoje os dois números divergem porque usam pools diferentes:

- KPI `totalDia` (185) → `sdrAgs` filtrado por `scheduled_date`. Não exclui `meeting_reason = 'segunda_reuniao'`. Se um closer marcou `sdr_responsavel_id` numa segunda reunião, ela entra.
- Painel `AgendasPorCanalPanel` (156) → query própria em `agendamentos` sem filtro de SDR e sem filtro de segunda reunião.

Nenhum dos dois aplica a regra combinada.

## Mudanças

### 1. `src/pages/DashboardComercialPage.tsx`
- No `SELECT` do `fetchAllAgendamentos`, adicionar `meeting_reason`.
- Ajustar `isSdrAg` para também exigir `meeting_reason <> 'segunda_reuniao'` (ou fazer o filtro no `todayAgs`/`monthAgs`/`yesterdayAgs`/`tomorrowAgs`).
- Resultado: KPI "Total agend. dia" passa a excluir segundas reuniões, mantendo reagendadas (status='reagendada' continua contando).

### 2. `src/components/dashboard/AgendasPorCanalPanel.tsx`
- Passar a receber do pai (`VendasTab`) a mesma lista já filtrada (`sdrAgs` sem segundas reuniões) em vez de rodar query própria — ou, alternativamente, adicionar no `select` `meeting_reason, created_by, sdr_responsavel_id` e replicar o filtro localmente + carregar a lista de SDRs.
- Escolha: **passar a lista pronta via prop** (`scheduledAgs` e `createdAgs`) desde o componente pai, para garantir 100% de paridade com o KPI. Fallback para query interna se prop não vier (retrocompat).

### 3. `src/components/dashboard/VendasTab.tsx`
- Onde `AgendasPorCanalPanel` é renderizado, montar `scheduledAgs`/`createdAgs` a partir do mesmo pool `sdrAgs` já usado nas métricas, aplicando o filtro `meeting_reason !== 'segunda_reuniao'`, e passar como props.

## Impacto

- KPIs "Total agend. dia", "Realizadas", "Canceladas", "No-shows", "Reagendadas" ficam consistentes entre si e com o painel Por Canal.
- Números vão **cair um pouco** (segundas reuniões saem da conta).
- Outros módulos (Métricas SDRs, Ranking, Produtividade, Erros) permanecem inalterados — conforme pedido.

## Validação

- Selecionar "Ontem": total do KPI = soma da coluna Qtd do painel Por Canal.
- Selecionar um intervalo: idem.
- Conferir que reagendadas continuam somando (card "Reagendadas" mantém valor).
