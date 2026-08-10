# Corrigir "Performance por Closer"

## O que a investigação mostrou

A troca de closer **antes** da reunião não causa erro: o card usa sempre o closer atual da agenda, ou seja, quem de fato realizou a call. Trocas depois da reunião realizada são raríssimas (3 em 30 dias) e 1.953 das 1.983 vendas dos últimos 30 dias foram lançadas pelo próprio closer da agenda.

O erro real está em **como o card conta "reuniões"**. Reproduzi exatamente os números da sua tela (01–10/08):

| Closer | Card | Realizadas de verdade |
|---|---|---|
| Hellen Faria | 4 vendas / 7 reuniões / 57% | 10 |
| Leandro Borges | 10 / 33 / 30% | 42 |
| Geraldo | 9 / 41 / 22% | 47 |

Causas:

1. O denominador só conta calls com resultado lançado e **exclui toda call marcada como "2ª reunião / follow-up"** e "call interrompida". Quem marca muito follow-up perde denominador e sobe a conversão (caso da Hellen).
2. Calls realizadas **sem resultado lançado** ficam de fora.
3. Os períodos divergem: **vendas** entram pela data em que foram registradas (ou `closed_at`), **não-fechamentos** pela data da reunião — numerador e denominador falam de calls diferentes.

## O que fazer

Alinhar a Performance por Closer com a regra já usada no card global de Taxa de Conversão:

- **Denominador**: calls realizadas no período (por data da reunião), excluindo 2ªs reuniões e "call interrompida" — igual ao card global, independente de ter resultado lançado.
- **Numerador**: vendas atribuídas a essas mesmas calls (respeitando `closed_at` quando a data da venda foi editada).
- **Receita e ticket médio**: somados sobre as vendas do mesmo conjunto, para bater com a conversão exibida.
- A soma dos closers passa a fechar com o card "Taxa de Conversão" do período.
- Subtexto no card explicando a regra ("calls realizadas no período, sem 2ªs reuniões e calls interrompidas").
- Filtro de canal (Geral / Social Selling / Tráfego) continua funcionando sobre esse conjunto.

## Detalhes técnicos

- Nova função no banco `dashboard_conversao_por_closer(p_from, p_to, p_channel)` reaproveitando a lógica de `dashboard_conversao_period`, agrupando por `agendamentos.closer_id` e retornando `closer_id`, `total_reunioes`, `total_vendas`, `receita`, `ids` (para o drilldown).
- `src/components/dashboard/VendasTab.tsx`: substituir o `useMemo` `closerPerf` (hoje derivado de `vendasDia`) pelo consumo da nova função; manter o clique abrindo o `MetricDrilldownDialog` com os `ids` retornados.
- A atribuição continua por `agendamentos.closer_id` (closer atual), que reflete quem realizou a call.

## Fora do escopo

- Nenhum dado histórico é alterado; muda apenas o cálculo exibido.
