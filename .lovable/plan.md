# Envio dos fechados do follow-up para o DataCrazy (webhook)

Adicionar na página de Follow-ups um botão único que envia em lote, por webhook, os leads cujo desfecho foi **Fechou**, com opção de escolher o período — inclusive **todo o histórico**.

## Como vai funcionar

- No topo da página de Follow-ups: botão **"Enviar fechados ao DataCrazy"**.
- Ao clicar, abre um diálogo com:
  - Seleção de período: **Hoje**, **Últimos 7 dias**, **Este mês**, **Intervalo personalizado** (data inicial/final) e **Todo o histórico**.
  - Filtro opcional de status de envio: "Só ainda não enviados" (padrão) ou "Todos do período" (permite reenvio).
  - Contagem de leads que serão enviados + lista (nome, telefone, valor, data de fechamento).
- Ao confirmar, o envio ocorre em lotes sequenciais com barra de progresso e resultado final ("48 enviados, 2 falharam").
- Cada lead enviado com sucesso registra data/hora do envio, então o padrão nunca duplica; falhas continuam na fila e podem ser reenviadas.
- Como "todo o histórico" pode ser grande, o envio é feito em **lotes de 20 leads** e pode ser interrompido pelo usuário; o que já foi enviado permanece marcado.
- Visível para gestor/moderador/supervisor; closer vê apenas os próprios registros (mesma visibilidade da lista da página).

## Quais leads entram

Vendas com resultado **Fechou** vindas do fluxo de follow-up (`vendeu = true`, com data de fechamento registrada), filtradas pela data de fechamento dentro do período escolhido. Sem período = histórico completo.

## O que é enviado

Somente o **payload via webhook**, com os dados da venda: nome e telefone do lead, closer, SDR, valor, produto, resumo da venda, data de fechamento, origem da venda e `outcome: "fechou"`.

A aplicação da tag `status-ganho` fica por conta da automação dentro do CRM — o app não chama a API de tags nem altera negócio/etapa/notas.

## Detalhes técnicos

**Migração (tabela `vendas`)**
- `datacrazy_ganho_sent_at timestamptz` — preenchido no envio bem-sucedido; base do filtro "só não enviados".

**Nova edge function `datacrazy-ganho-sync`**
- Body: `{ venda_ids: string[] }` — **lote fixo de até 20 ids por chamada**. Valida JWT do chamador e papel (gestor/moderador/supervisor, ou closer dono das vendas).
- Lê cada venda + agendamento (lead, telefone, closer, SDR) com service role.
- Webhook: `POST DATACRAZY_WEBHOOK_URL` com `event: "venda_resultado"`, mesmo formato de `datacrazy-venda-webhook` (`outcome: "fechou"`, `status: "Vendido"`, `is_vendeu: true`).
- Em sucesso grava `datacrazy_ganho_sent_at = now()`; retorna por item `{ venda_id, ok, error? }` para o frontend montar o resumo.

**Frontend**
- `src/pages/FollowUpsPage.tsx`: botão no cabeçalho da página.
- Novo `src/components/follow-ups/EnviarGanhosDataCrazyDialog.tsx`: seleção de período (reaproveitando `FacebookDateRangePicker`), consulta dos elegíveis em `vendas` (join `agendamentos` para nome/telefone), envio em blocos com progresso, toast de resumo e invalidação de `["follow-ups"]` / `["vendas-tab"]`.
- Registro em `audit_logs` via `logAudit("datacrazy_ganho_enviado", "venda", agendamento_id, { lead_name, periodo })`.

**Limites**
- Lotes de **20 leads** por chamada, processados sequencialmente, respeitando o limite do DataCrazy de **120 requisições/segundo** (1 requisição de webhook por lead). Pausa curta entre lotes e tratamento de `429` com backoff.
- Um histórico grande (centenas de leads) leva alguns minutos e mostra progresso.
