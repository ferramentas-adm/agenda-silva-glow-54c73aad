# Métricas do Calendário e do Dashboard Comercial batendo

## O que está causando a divergência hoje (27/08)

No banco há 242 reuniões para hoje (sem excluídas). A faixa do Calendário mostra 239 e o Comercial 240, por quatro regras diferentes entre as telas:

1. **Status "pendente"** (2 reuniões hoje): o Comercial conta, o Calendário não.
2. **2ª reunião criada por closer** (2 hoje): entra no total do Calendário, fica fora do Comercial.
3. **Usuários inativos**: o Comercial descarta 1 agenda criada por um SDR já inativado; o Calendário descarta 1 agenda cujo closer está inativo (não aparece na lista de colunas).
4. **Pool de status**: no Calendário os cards "Sem confirmar / Confirmadas / Realizadas / Não compareceu" contam todas as agendas do dia, enquanto "Total SDR" conta só SDR — recorte interno inconsistente.

## Regras canônicas acordadas

- **Pendente / aguardando atribuição: nunca conta** em nenhum card dos dois painéis.
- **Total do dia = agendas de SDR + 2ª reunião de closer**, nos dois painéis, mantendo cards separados ("Total SDR", "Total Closers", "Closer Realizada" / recorte equivalente no Comercial).
- **Inativos contam sempre**: inativar um SDR ou um closer não altera métrica histórica.
- **Calendário continua refletindo os filtros** de closer/SDR; sem filtro ativo os números batem exatamente com o Comercial.

## O que muda na prática

- Comercial deixa de contar as reuniões pendentes e passa a somar as 2ªs reuniões no total do dia, com o recorte só-SDR visível à parte.
- Comercial passa a contar agendas de SDRs inativados (histórico preservado).
- Calendário passa a incluir, na faixa superior, as agendas cujo closer está inativo (hoje elas somem da contagem).
- Todos os cards de status dos dois painéis passam a usar o mesmo pool (SDR + 2ª reunião, sem pendente) e a mesma classificação de "Não compareceu".
- Resultado esperado para hoje sem filtros: os dois painéis mostram o mesmo total (240 = 242 − 2 pendentes) e os mesmos números de confirmadas, realizadas, cancelado e no-show.

## Detalhes técnicos

- Novo módulo `src/lib/agendaMetrics.ts` como fonte única:
  - `AGENDA_TOTAL_STATUSES` (agendada, confirmada, realizada, cancelada, no_show, reagendada — sem `pendente`/`nao_confirmada`).
  - `isSdrAgenda(a, roleMap)` e `isSecondMeetingAgenda(a)` (mesma lógica atual: `created_by` com função SDR ou override, ou `sdr_responsavel_id` preenchido; closer criador ou `meeting_reason = 'segunda_reuniao'`).
  - `computeAgendaMetrics(pool, roleMap)` retornando `{ totalAgend, totalSdr, totalCloser, closerRealizada, agendada, confirmada, realizada, aindaReal, cancelada, noShow, naoComparecimento, ids }`, reaproveitando `splitNaoCompareceu` de `src/lib/noShowReasons.ts`.
- `src/pages/DashboardPage.tsx`: remove `TOTAL_STATUSES`/`statusCounts`/`allStatusCounts`/`closerCreatedCount` locais e passa a chamar `computeAgendaMetrics`. O pool da faixa superior deixa de exigir `closer_id ∈ selectedIds` (mantém apenas os filtros explícitos de SDR / "só meus agendamentos"); a grade do calendário continua usando `filtered` como hoje.
- `src/pages/DashboardComercialPage.tsx`: o mapa de SDRs passa a vir de `user_roles` + `get_public_profiles` sem filtro `active` (igual ao `userRolesMap` do Calendário) e as métricas passam a usar `computeAgendaMetrics` sobre o pool do dia/período. `todayCreated` continua no pool por `created_at` (aplicando o mesmo filtro de status).
- Cards afetados no Comercial: "Agendas Para Hoje / Ontem / Amanhã", "Total do mês" (+ comparativo do mês anterior), Confirmado, Agendado, Compareceu, No-show, Cancelado e "Taxa de Comparecimento" (denominador = novo total do dia). Drill-downs continuam usando os mesmos arrays de IDs, agora vindos do módulo compartilhado.
- Sem mudanças de banco e sem mudanças nas métricas de venda/conversão.
