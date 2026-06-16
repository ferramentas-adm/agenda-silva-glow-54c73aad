Plano:

1. Alterar somente `src/components/dashboard/VendasTab.tsx`.
2. No card `Taxa de Conversão`, parar de usar a lista de `vendas` como base da quantidade de reuniões, porque isso faz o número variar conforme registros de venda/follow-up e pode cair em outro dia.
3. Criar uma base exclusiva para esse card contando `agendamentos` com:
   - `scheduled_date` dentro do dia/período selecionado;
   - `status = realizada`;
   - `deleted_at` vazio;
   - incluindo também as reuniões “de closer”, conforme o total operacional que você citou.
4. Calcular a conversão só nesse card assim:
   - denominador: total de reuniões realizadas dessa base do calendário;
   - numerador: vendas fechadas vinculadas a esses agendamentos, sem duplicar por `agendamento_id`.
5. Manter todos os outros cards, motivos de não fechamento, drilldowns e tabelas com a regra atual.
6. Validar com os dias citados:
   - 15/06 deve usar o total de realizadas do calendário + closer;
   - 16/06 deve usar o total de realizadas do calendário + closer.