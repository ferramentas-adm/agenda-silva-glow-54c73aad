# Envio em lote de fechados do follow-up para o DataCrazy

Adicionar na página de Follow-ups um botão único que envia, de uma vez, todos os leads cujo desfecho no "Próximo passo" foi **Fechou** para o DataCrazy: dados da venda + aplicação da tag `status-ganho` no lead.

## Como vai funcionar

- No topo da página de Follow-ups aparece o botão **"Enviar fechados ao DataCrazy"** com um contador dos pendentes (ex.: "Enviar fechados ao DataCrazy (7)").
- Um lead entra nessa fila quando alguém registra o desfecho **Fechou** no modal "Próximo passo".
- Ao clicar, abre uma confirmação listando os leads que serão enviados. Ao confirmar, o sistema envia um por um e mostra o resultado ("6 enviados, 1 falhou").
- Cada lead enviado com sucesso sai da fila (fica registrado data/hora do envio), então não há envio duplicado. Falhas permanecem na fila para reenvio.
- Se não houver nada pendente, o botão fica desabilitado.
- Botão visível para gestor/moderador/supervisor e para o closer dono dos registros (mesma visibilidade da lista atual da página).

## O que é enviado ao DataCrazy

Para cada lead fechado:
1. Localiza o lead no DataCrazy pelo telefone cadastrado no agendamento.
2. Aplica a tag `status-ganho`. Se a tag ainda não existir na conta, ela é criada automaticamente e reutilizada nos envios seguintes.
3. Envia os dados da venda (nome e telefone do lead, closer, SDR, valor, produto, resumo da venda, data de fechamento, origem da venda).

Nada mais é alterado no DataCrazy: negócio/etapa não é movido, tags antigas não são removidas, nota não é criada.

## Detalhes técnicos

**Migração (tabela `vendas`)**
- `ganho_envio_pendente boolean not null default false` — marcado como `true` quando o desfecho "Fechou" é registrado no modal de follow-up.
- `datacrazy_ganho_sent_at timestamptz` — preenchido no envio bem-sucedido (e `ganho_envio_pendente` volta a `false`).

**Nova edge function `datacrazy-ganho-sync`**
- Recebe `{ venda_id }`, valida o JWT do usuário chamador e checa papel (gestor/moderador/supervisor/closer dono).
- Lê a venda + agendamento (lead, telefone, closer, SDR) com service role.
- Usa `DATACRAZY_API_URL` / `DATACRAZY_API_TOKEN` com o mesmo helper `dcApi` de `datacrazy-crm-sync` (retry/backoff + fallback g1):
  - `GET /leads?search=<telefone>` para achar o lead.
  - `GET /tags`; se não houver `status-ganho`, `POST /tags` para criar; depois `POST /leads/{leadId}/tags` com o `tagId`.
- Dispara o payload da venda pelo webhook existente (`DATACRAZY_WEBHOOK_URL`, evento `venda_resultado`, `outcome: "fechou"`).
- Em sucesso, grava `datacrazy_ganho_sent_at = now()` e `ganho_envio_pendente = false`; em falha retorna erro descritivo sem alterar a fila.

**Frontend**
- `src/pages/FollowUpsPage.tsx`:
  - `FollowUpActionDialog`: no desfecho `fechou`, incluir `ganho_envio_pendente: true` no update de `vendas`.
  - Novo hook/consulta dos pendentes (`vendas` com `ganho_envio_pendente = true` e `datacrazy_ganho_sent_at is null`, com join no agendamento para nome/telefone).
  - Novo componente `src/components/follow-ups/EnviarGanhosDataCrazyButton.tsx`: botão + diálogo de confirmação com a lista, envio sequencial chamando a edge function, toast com resumo e invalidação das queries.
- Registro em `audit_logs` via `logAudit("datacrazy_ganho_enviado", "venda", agendamento_id, { lead_name })`.
