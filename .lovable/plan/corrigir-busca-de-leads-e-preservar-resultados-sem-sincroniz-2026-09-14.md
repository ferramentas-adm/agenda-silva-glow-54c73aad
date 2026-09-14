# Corrigir busca de leads e preservar resultados sem sincronização

## Diagnóstico confirmado
- A busca digitada já usa o filtro aceito pelo DataCrazy: `GET /leads?filter[tags]=…&search=…&limit=25`.
- A causa principal dos timeouts não é a ausência de `search`: a carga paginada completa roda pela mesma fila serializada das consultas interativas. Uma consulta de nome/telefone ou uma etapa de sincronização pode ficar esperando atrás de dezenas de páginas; cada página ainda admite até 20–25 segundos e novas tentativas.
- O envio em tempo real de resultados chama `POST /functions/v1/datacrazy-venda-webhook`. Essa função encaminha `POST` para o URL completo configurado em `DATACRAZY_WEBHOOK_URL`, hoje no host `api.datacrazy.io`, caminho `/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/8440b40f-5ec8-4774-b535-aeaa1aa6b909`.
- O código não monta esse caminho por partes; portanto não há barra ou ID omitido para corrigir. Não será apontado para outra rota sem confirmação. A resposta observada nos envios relatados é `404 Not Found`.
- Hoje não existe registro durável de sucesso/falha desse webhook: após as tentativas, o erro é apenas registrado no navegador. Por isso, considerando que todos os envios falharam conforme relatado, os resultados dos últimos sete dias devem ser tratados como potencialmente pendentes.

## Implementação isolada
1. **Busca de leads**
   - Separar definitivamente consultas interativas da fila de carga em background.
   - Manter `search`, tag e limite de 25; limitar cada página da carga incremental e usar cache curto já existente.
   - Fazer exatamente uma repetição automática para falhas transitórias/timeout.
   - Exibir “DataCrazy demorou, tente de novo” sem desmontar a tela.
   - Permitir informar nome e telefone manualmente e seguir normalmente no agendamento.
   - Não alterar validações, capacidade, closer, horários ou demais etapas do agendamento.

2. **Fila durável de vendas/resultados**
   - Criar uma tabela protegida para payload, status, tentativas, resposta/erro e horários, com acesso somente do serviço interno.
   - Fazer `datacrazy-venda-webhook` gravar o payload antes do envio e marcar sucesso somente após resposta válida; em 404 ou qualquer falha, conservar como pendente.
   - Manter uma única repetição automática na chamada atual, sem criar rotina de reenvio e sem reenviar registros históricos.
   - Preservar exatamente o URL configurado até o DataCrazy confirmar uma rota diferente.

3. **Levantamento dos últimos sete dias**
   - Gerar uma lista em CSV com data de Brasília, lead, closer e valor dos resultados potencialmente não sincronizados.
   - Não reenviar nenhum resultado nem mensagem para leads.

## Validação
- Confirmar que busca lenta oferece entrada manual e que uma busca digitada não espera a carga completa.
- Validar a fila apenas com chamadas sem payload/autorização ou testes locais; não enviar evento real ao DataCrazy.
- Implantar somente `datacrazy-proxy` e `datacrazy-venda-webhook`, além da migração da fila.
