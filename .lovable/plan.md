## Objetivo

Enviar ao webhook `datacrazy-venda-webhook` um campo `status` claro para que o DataCrazy mova o card no pipeline conforme o desfecho registrado pelo closer no diálogo **Resultado da Reunião**.

## Mapeamento

| Escolha no formulário | `status` enviado |
|---|---|
| Vendeu = **Sim** | `Vendido` |
| Vendeu = Não + **Sim — agendar follow-up** | `Follow-up` |
| Vendeu = Não + **Não (venda perdida)** | `Perdido` |
| Vendeu = Não + **Sim — marcar segunda reunião** | *(não envia status novo — o webhook de status do agendamento já cuida da nova reunião)* |

## Alterações

### 1. `src/services/datacrazyVenda.ts`
- Adicionar `status?: "Follow-up" | "Perdido" | "Vendido" | null` à interface `VendaWebhookPayload`.

### 2. `src/components/VendaDialog.tsx` (função `handleSubmit`)
- Calcular `crmStatus` antes do `sendVendaToDataCrazy`:
  - `vendeu === "sim"` → `"Vendido"`
  - `vendeu === "nao" && acompanhamento === "follow_up"` → `"Follow-up"`
  - `vendeu === "nao" && acompanhamento === "perdeu"` → `"Perdido"`
  - `segunda_reuniao` → `null` (não envia para não duplicar com o webhook de agendamento)
- Incluir `status: crmStatus` no payload.

### 3. `supabase/functions/datacrazy-venda-webhook/index.ts`
- Repassar o campo `status` no `enrichedPayload` (já passa via spread, mas vamos garantir e documentar). Nenhuma lógica adicional necessária — o DataCrazy lê o `status` diretamente.

## Observações

- O campo existente `outcome` é mantido para compatibilidade interna (logs/auditoria), mas o `status` é o campo que o CRM vai consumir.
- Segunda reunião continua sem enviar status novo, conforme sua escolha. Se quiser adicionar um 4º status no futuro, basta estender o mapeamento.
- Não há mudanças de schema, RLS, ou banco — só payload do webhook e UI lógica.
