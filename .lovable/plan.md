# Corrigir pendências do João Amorim

## Casos confirmados

Há quatro agendamentos futuros, não excluídos, criados pelo João Amorim que continuam como `pendente` apesar de já terem closer ativo, evento no Google e link do Meet:

- Isabella Barbosa — 14/09/2026 às 10:00 — Bruno Casari
- Allan — 14/09/2026 às 15:00 — Pedro Ferro
- Leonardo Glaynner — 14/09/2026 às 19:00 — Vitor Lima
- Daniela Puertas — 17/09/2026 às 09:00 — Leandro Borges

## Ação

- Atualizar somente esses quatro registros de `pendente` para `agendada`.
- Preservar closer, data, horário, Meet, evento do Google e todos os demais dados.
- Deixar o fluxo padrão da mudança de status enviar a confirmação correta com horário de Brasília e link do Meet.
- Registrar a correção no histórico de auditoria, sem recriar eventos ou reuniões.

## Validação

- Confirmar que não restou nenhum agendamento do João Amorim em `pendente` que já possua closer e Meet.
- Conferir os quatro registros após a alteração e garantir que não houve duplicação de evento ou mudança de horário/closer.
- Verificar o acionamento único do fluxo padrão de confirmação para cada caso.
