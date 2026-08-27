# Taxa de Comparecimento sobre reuniões já ocorridas

## O que muda

Hoje o card "Taxa de Comparecimento — Hoje" divide as realizadas pelo **total de agendamentos do dia** (ex.: 54 de 250), o que joga a taxa para baixo durante o dia porque conta reuniões que ainda vão acontecer.

Passa a considerar apenas as reuniões cujo **horário já passou**:

- Denominador = agendas do período com horário já decorrido (horário BRT anterior ao momento atual), nos status válidos.
- Numerador = realizadas dentro desse mesmo recorte.
- Dias/períodos passados: todas as agendas já decorreram, então o número não muda.
- Legenda do card passa a explicitar o recorte: "54 de 120 reuniões já ocorridas".
- Se ainda não houve nenhuma reunião no dia, o card mostra "—" em vez de 0,0%.

## Detalhes técnicos

- `src/lib/agendaMetrics.ts`: novo helper `hasElapsed(a, nowBRT)` (usa `scheduled_date` + `scheduled_time` no fuso America/Sao_Paulo via helpers de `src/lib/timezone.ts`) e novos campos em `AgendaMetrics`: `ocorridas`, `ocorridasRealizada` e `ids.ocorridas` — calculados no mesmo `computeAgendaMetrics`, sem alterar nenhuma contagem existente.
- `src/pages/DashboardComercialPage.tsx`: `taxaComp` passa a ser `dayM.ocorridasRealizada / dayM.ocorridas`; o subtítulo do card usa `dayM.ocorridas`; drilldown do card aponta para as realizadas já ocorridas.
- Nenhuma mudança no banco e nenhum outro card afetado (Total agend. dia, Compareceu, No-show, Cancelado seguem iguais).
