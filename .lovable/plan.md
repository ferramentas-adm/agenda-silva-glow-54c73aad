# Performance por Closer: conversão sobre reuniões realizadas

## O que muda

Hoje a conversão de cada closer é `vendas / calls com resultado registrado` — reuniões realizadas em que o closer não preencheu o Resultado da Reunião simplesmente não entram na conta, o que infla a porcentagem (ex.: "1 vendas · 1 reuniões · 100% conv.").

Passa a ser:

- **Denominador** = todas as reuniões com status `realizada` no período atribuídas àquele closer (não excluídas), independentemente de existir registro de resultado. Mesmo critério do card geral de Taxa de Conversão, sem descontar Call Interrompida nem 2ª reunião.
- **Numerador** = vendas do closer no período (como hoje, incluindo vendas de follow-up e 2ª reunião).
- O rótulo do card continua "X vendas · Y reuniões · Z% conv.", agora com Y = reuniões realizadas.
- O filtro Geral / Social Selling / Tráfego continua valendo para os dois lados da conta.
- Closers com reuniões realizadas e nenhuma venda passam a aparecer na lista (hoje só aparece quem tem linha em `vendas`), com 0% de conversão e ordenados ao final.
- Receita e tíquete médio não mudam.

## Detalhes técnicos

- `src/components/dashboard/VendasTab.tsx`: nova query (`react-query`) em `agendamentos` para o período do card — `select id, closer_id, channel_type, status`, filtros `status = 'realizada'`, `deleted_at is null`, `scheduled_date` entre `convPeriodFrom`/`convPeriodTo`, e `closer_id = myCloserId` quando `isCloserView`. Mesmas opções de cache dos outros queries (`refetchInterval` 5 min, `staleTime` 60s).
- `closerPerf` passa a montar o denominador a partir dessa lista (contagem por `closer_id`, respeitando `closerChannelFilter` via `channel_type`) em vez de `vendas + naoFechou`. Vendas/receita continuam vindas de `vendasDia` (`v.vendeu`).
- `total` = reuniões realizadas do closer; `conversao` = `vendas / total` (0 quando `total = 0`); ordenação mantida (conversão, vendas, receita, total).
- O drilldown de cada closer continua abrindo as vendas fechadas (`closerIds` atual), sem alteração.
- Sem mudanças de banco e sem impacto nos demais cards (Taxa de Conversão geral, Performance por Produto, Motivos de Não Fechamento seguem iguais).
