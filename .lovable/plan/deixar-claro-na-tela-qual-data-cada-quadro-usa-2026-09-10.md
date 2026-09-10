# Deixar claro na tela qual data cada quadro usa

Os dois quadros da aba Vendas contam bases diferentes (verificado nos dados de 09/09: 28 vendas de 1ª call lançadas no dia contra 26 vendas em reuniões do próprio dia — as 2 de diferença são vendas lançadas em 09/09 de reuniões de 27/08 e 08/09). O cálculo está correto; falta deixar isso explícito.

## O que muda

1. **Cartão "Taxa de Conversão"**
   - Legenda passa a começar por "base: reuniões realizadas no período" antes do detalhe atual.
   - Texto final: "26 de 182 reuniões realizadas no período (a venda conta no dia da reunião · exclui 2ªs reuniões e calls interrompidas)".

2. **Painel "Vendas registradas"**
   - Subtítulo do título muda de "(independente do dia da reunião)" para "(pelo dia em que a venda foi lançada, mesmo que a reunião tenha sido antes)".
   - Nos blocos "De 1ª call" e "De follow-up / 2ª reunião", o rodapé passa a "Marcado pelo closer no resultado · pelo dia do lançamento".

3. **Aviso de conciliação (só quando houver diferença)**
   - No painel "Vendas registradas", quando existirem vendas do período cuja reunião foi em outro dia, mostrar uma linha discreta abaixo dos blocos: "N venda(s) desta lista têm reunião em outro dia, por isso não entram na Taxa de Conversão do período."
   - O texto é clicável e abre o drilldown já existente com esses leads.

Nenhuma regra de cálculo, consulta ou número muda.

## Detalhes técnicos

- `src/components/dashboard/VendasTab.tsx`:
  - Ajustar a string do `sub` do `KpiCard` "Taxa de Conversão" (linha do template com `totalVendasConv`/`totalReunioesConv`).
  - Em `VendasHojeCard`: atualizar o `span` do `CardTitle`, os rodapés dos dois botões e adicionar o cálculo `foraDoPeriodo = filtered.filter((v) => !inPeriod(v.scheduled_date))`, renderizando a linha de aviso apenas quando `foraDoPeriodo.length > 0`, com `onOpenDrill` nos ids desse subconjunto.
- Sem migração, sem alteração de RPC e sem mudança em outros cards.

## Validação

- 09/09: cartão continua 14,3% (26 de 182); painel continua 29 / 28 / 1; aviso mostra "2 vendas com reunião em outro dia" e o drilldown lista Wellerson e Marcus Vinicius.
- Um dia sem divergência não exibe a linha de aviso.
