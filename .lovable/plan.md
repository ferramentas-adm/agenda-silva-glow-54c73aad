# Desligar envio de vendas em tempo real

## Objetivo
Manter apenas a sincronização diária em lote já existente e impedir qualquer chamada externa do fluxo de vendas em tempo real.

## Implementação
- Alterar `datacrazy-venda-webhook` para validar o usuário e o payload, registrar o evento na fila com estado `coberto_pelo_lote` e retornar sucesso sem chamar o DataCrazy.
- Ampliar o estado permitido da fila por migração, preservando todos os registros e históricos atuais.
- Manter o registro da venda na tela desacoplado dessa sincronização, sem aviso ou erro de DataCrazy ao usuário.
- Não modificar as funções, o horário, o destino ou o payload do envio diário em lote.

## Validação
- Confirmar que não resta chamada externa no `datacrazy-venda-webhook`.
- Confirmar que os formulários de resultado continuam salvando normalmente e que a sincronização desativada permanece não bloqueante.
- Verificar compilação e erros da prévia.
