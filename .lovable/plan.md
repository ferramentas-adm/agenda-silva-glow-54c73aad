## Problema

No payload do webhook de venda (`datacrazy-venda-webhook`), os campos `valor_apresentado`, `valor_previsto`, `data_prevista` (e `recebimento_acordado`) não são enviados. Eles existem no payload do webhook de status (montado pelo trigger SQL), mas não no de venda — então no cenário "Não + Follow-up" o CRM não recebe esses dados.

Hoje o `VendaDialog.handleSubmit` já coleta:
- `valor` (mas só preenchido quando `vendeu === "sim"`)
- `hasRecebimento`, `valorPrevistoNum`, `dataPrevista` (seção "Recebimento futuro", permitida em "Não + Follow-up")

E grava em `pagamentos`, mas não inclui nada disso no payload enviado para o DataCrazy.

## Mudanças

1. **`src/services/datacrazyVenda.ts`** — Estender `VendaWebhookPayload` com os campos:
   - `valor_apresentado: number | null`
   - `recebimento_acordado: boolean`
   - `valor_previsto: number | null`
   - `data_prevista: string | null` (formato `YYYY-MM-DD`)

2. **`src/components/VendaDialog.tsx`** — No `sendVendaToDataCrazy(...)` do `handleSubmit`, adicionar:
   - `valor_apresentado: valorNum` (mesmo valor de `valor`, mas com nome alinhado ao webhook de status; será `null` em "Não + Follow-up" se o usuário não digitou — alternativa: aceitar valor também no cenário "Não". Confirmar abaixo.)
   - `recebimento_acordado: hasRecebimento`
   - `valor_previsto: hasRecebimento && valorPrevistoValido ? valorPrevistoNum : null`
   - `data_prevista: hasRecebimento && dataPrevista ? format(dataPrevista, "yyyy-MM-dd") : null`

3. **`supabase/functions/datacrazy-venda-webhook/index.ts`** — Nenhuma mudança lógica: ele já faz spread do payload, então os novos campos passam adiante automaticamente. Apenas garantir que continua mandando `event: "venda_resultado"` no topo.

## Ponto a confirmar

Hoje o campo "Valor" só aparece/é exigido quando `vendeu === "sim"`. No cenário "Não + Follow-up" não existe input de valor apresentado na UI.

Opções:
- (A) Enviar `valor_apresentado = null` em "Não + Follow-up" (apenas `valor_previsto`/`data_prevista` quando o usuário preencheu Recebimento futuro). Não muda UI.
- (B) Permitir digitar "valor apresentado" também quando "Não", como campo opcional, e mandar ao CRM.

Default proposto: **(A)** — sem mudança de UI, apenas o payload passa a carregar os 4 campos novos (com `valor_apresentado = null` neste cenário). Se confirmar (B), adiciono o input.

Depois da implementação, disparamos novamente o cenário "Não + Follow-up" via curl para validar o payload final.