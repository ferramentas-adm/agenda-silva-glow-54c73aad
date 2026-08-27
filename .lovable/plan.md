# Conversão por hora: contar vendas mesmo sem status "realizada"

## Por que hoje mostra 9 e não 15

Das 15 vendas fechadas hoje (27/08):

- 3 são de **follow-up** (reuniões de 21, 24 e 25/08) — seguem fora, por definição do card.
- 2 são de 1ª call de reuniões de **26/08** (fechadas hoje) — entram no dia da reunião, 26/08.
- 1 é de uma reunião de hoje às 17h que ficou com status **confirmada**, não "realizada" — hoje é descartada.

## O que muda

- A coluna **Vendas** do card passa a contar toda venda de 1ª call cuja reunião cai no período, **independente do status da reunião** (realizada, confirmada, etc.). Com os dados de hoje, 17h ganha +1 e o total do dia vai de 9 para 10.
- O **denominador da conversão continua sendo apenas reuniões com status `realizada`**, como hoje. Isso preserva o critério "conversão sobre calls realizadas" já usado em Performance por Closer.
- Consequência aceita: em horas com venda registrada mas reunião ainda não marcada como realizada, a conversão pode passar de 100%; nesse caso a célula da tabela mostra o valor com um aviso discreto (ícone/tooltip "reunião com venda ainda não marcada como realizada").
- Vendas de follow-up seguem fora do card (sem mudança).
- Texto explicativo do card ajustado para deixar o critério claro: vendas de 1ª call pela hora da reunião; conversão sobre reuniões realizadas.

## Detalhes técnicos

- `src/components/dashboard/ConversaoPorHoraCard.tsx`, query `conv-hora-vendas`: remover os filtros `.eq("agendamentos.status", "realizada")` (mantendo `deleted_at is null`, `vendeu = true`, janela de `scheduled_date` e filtro opcional de closer). O filtro de 1ª call (`venda_origem <> 'follow_up'`, `segunda_reuniao = false`) permanece.
- Query `conv-hora-realizadas` fica inalterada (segue `status = 'realizada'`), então o denominador não muda.
- Na tabela/tooltip, sinalizar linhas em que `vendas > realizadas` para explicar conversões acima de 100%.
- Sem migração e sem alteração em outros cards (Vendas registradas, Performance por Closer, Taxa de Conversão).
