## Diagnóstico

Os dois dashboards usam definições diferentes para "agenda de SDR", então comparar números entre eles não bate:

**Dashboard (calendário) — `Total agend. dia`, `Total Closers`:**
- SDR = `created_by` é SDR **OU** `sdr_responsavel_id` preenchido — **excluindo `cancelada`**
- Closer = `created_by` é Closer **OU** `meeting_reason='segunda_reuniao'` — **excluindo `cancelada`**

**Dashboard Comercial → Métricas SDRs — `Agendas Para [data]`:**
- SDR = somente `created_by` é SDR — **incluindo canceladas**
- Não considera `sdr_responsavel_id`

### Conferi no banco (27/05 = ontem):
- SDR só por `created_by` (com canceladas) = **69** ← o que aparece no Comercial
- SDR ativos (excl. canceladas), incluindo `sdr_responsavel` = **62** ← o que vai no Total do Dashboard
- Closer ativos = **4**
- `Total agend. dia` = 62 + 4 = **66** ← o que está aparecendo

Confirmado: não há overlap real (segunda reunião só é criada por Closer). A diferença entre 69 e 62 são 7 canceladas + alguns agendamentos sem `sdr_responsavel_id` que entram no Comercial mas não no Dashboard.

## Proposta

Alinhar o **Dashboard Comercial** à mesma definição do **Dashboard (calendário)**:

1. Pool de SDR no Comercial passa a considerar `created_by SDR` **OU** `sdr_responsavel_id` preenchido (mesma regra do `isSdrAgenda` do Dashboard).
2. Cards de contagem do dia (`Agendas Para`, `Agendas De`, `Agendas Para [amanhã]`, `Total mês`) passam a **excluir `cancelada`** — assim "Agendas Para" deixa de contar agendas que foram canceladas (o que faz mais sentido conceitualmente, e o card "Cancelado" já mostra essas separadamente).
3. `todayCreated` (Agendas Geradas) recebe o mesmo tratamento: exclui canceladas.
4. Métricas individuais (`Confirmado`, `Agendado`, `Compareceu`, `No-show`, `Cancelado`, `Reagendado`) **não mudam** — continuam por status.
5. `Taxa de Comparecimento` continua usando o `totalDia` (que já refletirá o novo pool).

### Resultado esperado depois da mudança

| Dia | SDR (Comercial) | Closer (Dashboard) | Total agend. dia (Dashboard) |
|-----|---|---|---|
| 27/05 | 62 | 4 | 66 |
| 28/05 | 40 | 1 | 41 |

Os números **vão bater** entre as duas telas.

⚠️ Observação: você disse "deveria dar 73". Isso só seria possível se "Total agend. dia" passasse a **incluir canceladas**. Hoje as canceladas estão fora porque o card "Canceladas" já as mostra separadamente — incluí-las no total geraria dupla contagem visual. Recomendo **manter excluindo canceladas** e alinhar o Comercial pra baixo (62 em vez de 69). Se preferir o oposto (Total = 69+4=73, incluindo canceladas em todos os lugares), me avise antes da implementação.

## Arquivos

- `src/pages/DashboardComercialPage.tsx` — ajustar `sdrAgs`/`createdAgs`/`todayScheduled`/`todayCreated`/`monthAgs` (linhas ~290-315) para usar nova definição de SDR e excluir canceladas dos totais.

## Técnico

```ts
// src/pages/DashboardComercialPage.tsx
const isSdrAg = (a) =>
  (a.created_by && sdrUserIds.has(a.created_by)) || !!a.sdr_responsavel_id;

const sdrAgs = agendamentos.filter(a => isSdrAg(a) && a.status !== 'cancelada');
const sdrCreatedAgs = createdAgs.filter(
  a => isSdrAg(a) && !a.original_agendamento_id && a.status !== 'cancelada'
);
```
