# Por que a venda de "1ª call" de 12/09 não entrou na Taxa de Conversão

## Causa (verificada nos dados)

As duas vendas lançadas em 12/09 são:

- **Leslie Litano Tealdi Nascimento** — R$ 5.000, marcada como **venda avulsa** (sem reunião de verdade; horário 00:00). É ela que aparece em "De 1ª call".
- **Marcos Martins Ferreira** — R$ 5.000, marcada como follow-up, reunião em 11/09. É a que já aparece no aviso "reunião em outro dia".

A Taxa de Conversão mede vendas sobre **reuniões realizadas** e, por regra, **ignora vendas avulsas** (elas não vêm de uma reunião agendada, então não têm denominador). Por isso o cartão mostra 0 de 29: nenhuma das 2 vendas do dia veio de reunião realizada no período. O cálculo está correto — o que falta é isso ficar visível na tela.

## O que muda (só texto/aviso na aba Vendas)

1. No painel **"Vendas registradas"**, além do aviso atual de "reunião em outro dia", passar a mostrar uma linha equivalente para vendas avulsas:
   - "1 venda desta lista é avulsa (sem reunião), por isso não entra na Taxa de Conversão do período."
   - Clicável, abrindo o drilldown já existente com esses leads.
2. Na legenda do cartão **"Taxa de Conversão"**, acrescentar ao final "· exclui vendas avulsas", ficando: "0 de 29 reuniões realizadas no período (a venda conta no dia da reunião · exclui 2ªs reuniões, calls interrompidas e vendas avulsas)".

Nenhum número, consulta ou regra de cálculo muda.

## Detalhes técnicos

- `src/components/dashboard/VendasTab.tsx`:
  - Em `VendasHojeCard`, adicionar `avulsas = filtered.filter((v) => v.is_venda_avulsa)` (incluir a coluna no select da query se ainda não vier) e renderizar a nova linha de aviso quando `avulsas.length > 0`, com `onOpenDrill`.
  - Ajustar o texto do `sub` do `KpiCard` "Taxa de Conversão" (linha ~998).
  - O aviso de "reunião em outro dia" passa a excluir as avulsas para não contar a mesma venda duas vezes.
- Sem migração, sem alteração na RPC `dashboard_conversao_period` e sem mudança nos outros cards.

## Validação

- 12/09: Taxa de Conversão continua 0 de 29; painel continua 2 / 1 / 1; aparecem os dois avisos — 1 avulsa (Leslie) e 1 com reunião em outro dia (Marcos).
