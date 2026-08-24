# Plano: Webhook de resultado de venda para URL separada no DataCrazy

## Objetivo
Permitir que o "Webhook de resultado de venda (disparado pelo frontend)" seja enviado para uma URL diferente da URL usada pelo webhook de status de agendamento, possibilitando um segundo fluxo no DataCrazy.

## Estado atual
- O webhook de venda é disparado pelo frontend via Edge Function `datacrazy-venda-webhook`.
- Hoje essa Edge Function lê a variável de ambiente `DATACRAZY_WEBHOOK_URL`, a mesma usada pelo webhook de status de agendamento (`datacrazy-webhook`).
- A URL já é editável pela tela Administração > Configurações Gerais (chave `datacrazy_webhook_url` em `app_settings`), mas é única para os dois webhooks.

## Mudanças propostas

### 1. Nova configuração em `app_settings`
- Criar a chave `datacrazy_venda_webhook_url` na tabela `app_settings`.
- A URL de status (`datacrazy_webhook_url`) continua existindo e funcionando normalmente.

### 2. Tela "Administração" > "Configurações Gerais"
- Adicionar um segundo campo de URL logo abaixo do campo existente:
  - Rótulo: "URL do webhook de resultado de venda DataCrazy"
  - Placeholder: `https://...`
  - Salva em `datacrazy_venda_webhook_url`.
- Manter o campo atual renomeado/clarificado como "URL do webhook de status de agendamento DataCrazy" (chave `datacrazy_webhook_url`).

### 3. Edge Function `supabase/functions/datacrazy-venda-webhook/index.ts`
- Adicionar cliente Supabase com `service_role` para ler `app_settings`.
- Buscar o valor de `datacrazy_venda_webhook_url`.
- Ordem de prioridade da URL:
  1. `datacrazy_venda_webhook_url` em `app_settings`.
  2. Variável de ambiente `DATACRAZY_VENDA_WEBHOOK_URL` (nova, opcional).
  3. Fallback para `DATACRAZY_WEBHOOK_URL` (mantém compatibilidade se a nova URL não estiver configurada).
- Se nenhuma URL for encontrada, retornar erro informativo.
- Manter o payload atual (`event: "venda_resultado"` + campos do resultado da venda).

### 4. Variável de ambiente opcional
- Adicionar suporte à variável `DATACRAZY_VENDA_WEBHOOK_URL` na Edge Function, servindo como segunda opção de fallback/controlada por secret.

### 5. Validação
- Testar o salvamento da nova URL na tela de administração.
- Testar o lançamento de uma venda e confirmar que o payload chega na nova URL configurada.
- Confirmar que o webhook de status de agendamento continua indo para a URL antiga sem mudanças.

## Arquivos envolvidos
- `src/pages/AdminPage.tsx`
- `supabase/functions/datacrazy-venda-webhook/index.ts`
- Banco: tabela `public.app_settings` (inserir chave `datacrazy_venda_webhook_url`)

## Notas
- Nenhuma mudança no formato do payload de venda.
- Nenhuma mudança no webhook de status de agendamento (`datacrazy-webhook`).
- A alteração é retrocompatível: se a nova URL não for configurada, o comportamento atual é preservado.
