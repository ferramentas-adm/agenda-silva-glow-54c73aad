# Revisão do dashboard — conversão e performance por closer

## Diagnóstico (confirmado nos dados de hoje, 25/09)

**1. Por que reuniões da Turma B entram na Taxa de Conversão**
Hoje o card filtra pelo **lead** (desqualificado fica de fora, a não ser que tenha pago), e não pelo **time do closer**. Os leads que foram agendados como qualificados continuam qualificados mesmo que o closer tenha passado para a Turma B. Hoje isso colocou 3 reuniões da Turma B no card:
- Bruno Casari: 2 reuniões realizadas com leads qualificados
- Lucca Lofiego: 1 reunião realizada com lead qualificado

O sistema também não guarda em qual time o closer estava no dia da reunião — só sabe o time dele agora.

**2. Por que o Lucca aparece com só 1 reunião realizada**
Hoje ele teve 11 reuniões na agenda:
- 4 marcadas como "Realizada" → só 1 conta. As outras 3 (12h, 14h, 16h) são de leads desqualificados sem venda paga, e a regra que você definiu tira essas reuniões de todos os números.
- 3 ainda estão em "Em call" (17h, 19h, 20h) → só contam depois que o closer mudar para "Realizada".
- 3 não compareceram e 1 está confirmada (21h).

Não é um erro: é a regra de desqualificados combinada com status que ainda não foram atualizados. Se quiser que a Performance por Closer mostre todas as reuniões realizadas (com ou sem lead desqualificado), é só me pedir. Esse item fica sem alteração neste plano.

## O que vou mudar

1. **Guardar o time de cada reunião.** Cada reunião passa a registrar o time (A ou B) do closer que ficou com ela. O time é gravado quando a reunião é criada ou trocada de closer e fica fixo quando a reunião vira "Realizada". Assim, se um closer mudar de time amanhã, os dias anteriores não mudam.
2. **Preencher as reuniões antigas** com o time atual de cada closer. Para os closers que mudaram de A para B hoje, as reuniões de hoje já ficam como B.
3. **Taxa de Conversão só com a Turma A.** O card passa a contar só reuniões realizadas da Turma A. A regra atual de leads desqualificados continua valendo.
4. Nada muda em Performance por Closer, faturamento, KPIs de vendas nem no calendário.

## Detalhes técnicos

- Migração: coluna `agendamentos.closer_turma text check in ('A','B')`, com trigger `BEFORE INSERT OR UPDATE OF closer_id, status`. O trigger lê `closers.em_treinamento` (true = B) enquanto o status não for `realizada` e congela o valor depois disso. A reatribuição por gestor com a reunião já realizada atualiza o valor pelo novo closer.
- Backfill: `update agendamentos a set closer_turma = case when c.em_treinamento then 'B' else 'A' end from closers c where c.id = a.closer_id`.
- `dashboard_conversao_period`: adicionar `AND a.closer_turma = 'A'` no CTE `ags`, sem mudar a assinatura. Com isso, o card do VendasTab e a ferramenta MCP `sales-kpis` passam a seguir a mesma regra.
- Verificação: rodar a RPC para 25/09 antes e depois da mudança. O total deve cair exatamente 3 reuniões (as 2 do Bruno e a 1 do Lucca).
