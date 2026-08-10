# Corrigir "Performance por Closer"

## O que a investigação mostrou

Sua suspeita (crédito indo para o closer errado) **não se confirmou**:

- Em 30 dias, apenas **3 reuniões** tiveram troca de closer *depois* de marcadas como realizadas.
- Das 1.983 vendas registradas em 30 dias, só **30** foram lançadas por alguém diferente do closer atual da agenda (quase todas pela moderadora Amanda, lançando em nome do closer).

O erro real está na **forma de contar "reuniões" do card**, que hoje é diferente de todos os outros cards:

1. O denominador só conta calls que têm resultado registrado — e **exclui toda call marcada como "2ª reunião / follow-up"** e "call interrompida". Ex.: Hellen Faria tem dezenas de calls marcadas com esse flag; elas somem do denominador, mas as vendas dela continuam contando → 57% de conversão.
2. Calls realizadas **sem resultado lançado** simplesmente não entram no denominador.
3. Os períodos são diferentes: **vendas** entram pela data em que foram registradas (ou `closed_at`), **não-fechamentos** entram pela data da reunião. Numerador e denominador falam de calls diferentes.

Resultado: o ranking premia quem marca muito follow-up e pune quem fecha ou perde a call na hora. Os números não fecham com o card "Taxa de Conversão".

## O que fazer

Alinhar a Performance por Closer exatamente com a regra já usada no card global de Taxa de Conversão:

- **Denominador**: calls realizadas no período (por data da reunião), excluindo 2ªs reuniões e "call interrompida" — igual ao card global.
- **Numerador**: vendas atribuídas a essas mesmas calls (respeitando `closed_at` quando o gestor editou a data da venda, como já é feito hoje no card global).
- **Receita e ticket médio**: somados sobre as vendas do mesmo conjunto, para o valor bater com a conversão exibida.
- Com isso, a soma dos closers passa a fechar com o card "Taxa de Conversão" do período.
- Subtexto no card explicando a regra ("calls realizadas no período, sem 2ªs reuniões e calls interrompidas"), no mesmo padrão dos outros cards.
- Filtro de canal (Geral / Social Selling / Tráfego) continua funcionando sobre esse conjunto.

## Detalhes técnicos

- Nova função no banco `dashboard_conversao_por_closer(p_from, p_to, p_channel)` reaproveitando a lógica de `dashboard_conversao_period`, agrupando por `agendamentos.closer_id` e retornando: `closer_id`, `total_reunioes`, `total_vendas`, `receita`, `ids` (para o drilldown).
- `src/components/dashboard/VendasTab.tsx`: substituir o `useMemo` `closerPerf` (que hoje deriva de `vendasDia`) pelo consumo da nova RPC; manter o clique no item abrindo o `MetricDrilldownDialog` com os `ids` retornados.
- A atribuição continua por `agendamentos.closer_id` (closer atual), que é o que reflete quem realizou a call.

## Fora do escopo

- Nenhum dado histórico é alterado; só muda a forma de calcular a exibição.
