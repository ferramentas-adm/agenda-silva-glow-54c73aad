# Taxa de Conversão: cartão travado em carregamento

## O que está acontecendo (confirmado no banco)

O cartão vem de uma única função de banco (`dashboard_conversao_period`). Rodando o mesmo cálculo para 01/08–31/08 medi **13,4 segundos só para a contagem** — e isso sem o RLS do usuário e sem a lista de IDs que o cartão também pede. Com essas duas coisas somadas, o tempo estoura e o cartão fica girando indefinidamente (as outras métricas da faixa aparecem porque usam funções agregadas novas e rápidas).

Causa: dentro da função, a checagem "esse lead fechou numa 2ª reunião?" é executada **uma vez por reunião do período** — 3.058 execuções, cada uma varrendo a tabela de vendas inteira (7.837 linhas) e comparando telefone com expressão regular. Deu 9,1 milhões de leituras de página para produzir um único número. O período de um mês é o primeiro em que isso passa do limite; períodos de 1 dia continuam rápidos por acidente (poucas reuniões).

Os números em si estão corretos (01/08–31/08: 3.424 reuniões, 369 vendas ≈ 10,8%) — o problema é só de desempenho.

## Correção

Reescrever a função para calcular o vínculo de 2ª reunião **uma única vez** por período, em vez de repetir por reunião:

- Montar antes uma lista única das 2ª reuniões que fecharam venda (com telefone já normalizado).
- Cruzar essa lista com as reuniões do período por junção (hash join), tanto pelo vínculo direto (`original_agendamento_id`) quanto pelo telefone normalizado.
- Manter **exatamente** as mesmas regras de negócio atuais: só reuniões `realizada` não excluídas, sem vendas avulsas, sem 2ª reunião no denominador, exclusão de "Call Interompida/Interrompida", venda contada quando a data de fechamento cai no período ou está vazia, e o crédito por 2ª reunião fechada.

Resultado esperado: milissegundos em vez de minutos, com os mesmos totais.

## Detalhes técnicos

- Migração substituindo `public.dashboard_conversao_period(p_from, p_to, p_closer_id)`:
  - CTE `segundas` marcada como `MATERIALIZED` (hoje é inlinada e re-executada por linha, origem do custo).
  - Trocar o `EXISTS (... OR ...)` correlacionado por duas semi-junções pré-agregadas: um conjunto de `original_agendamento_id` e um conjunto `(phone, min(scheduled_date))`, aplicando a condição `a.scheduled_date <= sg.scheduled_date` sobre a data mínima.
  - `array_agg(id)` do retorno mantido (usado pelo drilldown do cartão).
  - Assinatura, tipo de retorno, `STABLE`, `search_path` e grants (`authenticated`) preservados — nenhuma mudança no frontend.
- Índice de apoio, se o plano ainda exigir: `agendamentos (meeting_reason, deleted_at)` filtrado para `meeting_reason = 'segunda_reuniao'`, e índice em `vendas (agendamento_id) WHERE vendeu`.
- `src/components/dashboard/VendasTab.tsx`: apenas o estado de carregamento — o cartão passa a exibir esqueleto (`isLoading`/`isError`) em vez de girar sem fim, e mensagem curta de falha se a consulta der erro. Sem mudança de cálculo no cliente.

## Validação

- 01/08–31/08: 3.424 reuniões, 369 vendas (≈10,8%), retorno abaixo de ~1s.
- "Hoje" e intervalos curtos: mesmos números de antes da mudança.
- Visão de closer (filtro por closer): totais coerentes com a Performance por Closer.
