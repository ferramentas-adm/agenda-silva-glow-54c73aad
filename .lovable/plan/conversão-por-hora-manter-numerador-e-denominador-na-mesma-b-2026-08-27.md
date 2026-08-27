# Conversão por hora: manter numerador e denominador na mesma base

## Por que hoje mostra 9 e não 15

Das 15 vendas fechadas hoje (27/08):

- 3 são de **follow-up** (reuniões de 21, 24 e 25/08) — ficam fora, por definição do card.
- 2 são de 1ª call de reuniões de **26/08** (fechadas hoje) — entram no dia da reunião, 26/08.
- 1 é de uma reunião de hoje às 17h que ainda está com status **confirmada**, não "realizada" — fica fora.

## O que muda

- **Regra do cálculo permanece:** venda só entra no numerador quando a reunião está com status `realizada`, exatamente a mesma base do denominador. Nada de conversão acima de 100% nem venda contada sobre reunião que o denominador ignora.
- O card ganha **transparência** para não parecer erro:
  - Legenda explícita: "vendas de 1ª call em reuniões marcadas como realizadas, pela hora da reunião".
  - Um selo/aviso discreto no topo quando existirem, no período, vendas de 1ª call em reuniões **ainda não marcadas como realizada** — mostrando quantas são (hoje: 1) e explicando que entrarão no cálculo assim que o closer atualizar o status.
  - Tooltip do selo indicando também quantas vendas do período são de follow-up ou de reuniões de outros dias, para conciliar com o card "Vendas registradas".
- Vendas de follow-up seguem fora do card.

## Detalhes técnicos

- `src/components/dashboard/ConversaoPorHoraCard.tsx`:
  - Query `conv-hora-vendas` mantém `.eq("agendamentos.status", "realizada")` (sem mudança de filtro no cálculo).
  - Nova query leve (mesma janela de `scheduled_date`, `vendeu = true`, `deleted_at is null`, 1ª call) **sem** o filtro de status, usada apenas para contar as vendas pendentes de atualização de status: `pendentes = total - realizadas`.
  - Renderizar o selo/aviso só quando `pendentes > 0`, com tooltip explicando o critério.
- Sem migração, sem mudança nas RPCs e sem alteração em outros cards (Vendas registradas, Performance por Closer, Taxa de Conversão).
