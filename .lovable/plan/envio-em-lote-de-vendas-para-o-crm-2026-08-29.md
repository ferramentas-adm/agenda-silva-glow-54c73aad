# Envio em lote de vendas para o CRM

Sim, dá para fazer via webhook. Hoje cada venda é enviada uma a uma, no momento em que o closer registra o resultado. Vamos criar um envio em lote que reaproveita exatamente o mesmo formato de payload, mas para um período escolhido (agosto, por exemplo) e apontando para uma URL nova de importação — assim a carga histórica não dispara as automações do fluxo do dia a dia.

## O que será entregue

1. **Nova aba "Envio em lote para o CRM" na página Administração** (visível apenas para Gestor/Admin):
   - Campo de URL de importação (salva nas configurações, chave própria, separada da URL do webhook de venda normal).
   - Seleção de período (padrão: 01/08 a 31/08 do mês corrente).
   - Botão "Pré-visualizar", que mostra quantas vendas fechadas entram no lote e a lista (lead, telefone, closer, valor, data de fechamento).
   - Botão "Enviar lote", com barra de progresso, contador de enviados/falhas e lista de erros por lead.
   - Botão "Reenviar apenas as falhas".

2. **Escopo do lote**: apenas vendas com `vendeu = true`, atribuídas pela data de fechamento (`closed_at`, com fallback para a data de registro em BRT). Agendamentos excluídos (soft delete) ficam de fora. Em agosto/2026 isso corresponde a 403 registros.

3. **Payload**: idêntico ao webhook de resultado de venda já usado hoje (lead, telefone, closer, SDR, valor, origem da venda, resumo, order bumps, `outcome: "fechou"`, `status: "Vendido"`, etc.), com dois campos extras para o CRM diferenciar a carga: `event: "venda_resultado_lote"` e `backfill: true`.

## Detalhes técnicos

- **Nova edge function `crm-bulk-vendas`** (exige sessão autenticada e papel gestor/moderador):
  - `action: "preview"` → devolve a contagem e a lista do período.
  - `action: "send"` → recebe um bloco de IDs de venda (lotes de ~25), monta o payload de cada um, envia sequencialmente para a URL de importação com intervalo curto entre chamadas (evita rate limit), timeout de 15s e 2 tentativas por item; devolve o resultado item a item.
  - O frontend percorre os blocos em sequência, o que mantém a função dentro do tempo limite de execução e alimenta a barra de progresso.
- **URL de destino** guardada em `app_settings` (chave `datacrazy_bulk_import_url`), editável na mesma aba.
- **Auditoria**: cada execução registra em `audit_logs` quem disparou, o período, o total enviado e o total de falhas.
- Nada é alterado nas tabelas `vendas` / `agendamentos` — o envio é somente leitura.

## Fora do escopo

- Não reenvia reuniões perdidas/não comparecidas (apenas vendas fechadas).
- Não altera o webhook de venda em tempo real que já funciona hoje.
