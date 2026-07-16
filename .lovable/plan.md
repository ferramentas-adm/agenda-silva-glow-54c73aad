# Alinhar webhook de venda ao formato "realizada" do CRM

## Objetivo
No fluxo do diálogo "Próximo passo do follow-up" (`FollowUpsPage`) e demais chamadas de `sendVendaToDataCrazy`, quando o desfecho for **fechou** ou **perdeu**, o payload enviado ao DataCrazy deve seguir o mesmo formato do webhook já existente de "reuniao_realizada", acrescido do campo `is_vendeu`.

## Decisões (defaults escolhidos)
- **Mesclar em um único payload**: o webhook continua sendo `datacrazy-venda-webhook` (um único disparo), mas o corpo passa a incluir os campos-chave do `reuniao_realizada` + `is_vendeu`. Os campos atuais (valor, resumo, motivo, follow_up, etc.) são mantidos para não perder informação já consumida pelo CRM.
- **Escopo**: aplica-se a `outcome = "fechou"` e `outcome = "perdeu"`. Para `follow_up` e `em_andamento` o payload segue como está hoje (evita mudar comportamento onde a reunião ainda não é "realizada" no CRM).
- **is_vendeu**:
  - `fechou`  → `is_vendeu: true`
  - `perdeu`  → `is_vendeu: false` **e** `motivo_status: "nao-venda perdida"` (para preservar a string literal citada)

## Formato do novo payload (fechou / perdeu)
```text
{
  event: "venda_resultado",          // mantido (já injetado pela edge function)
  evento: "status_atualizado",       // novo — igual ao reuniao_realizada
  pipeline_acao: "reuniao_realizada",// novo
  status_novo: "realizada",          // novo
  timestamp: <ISO now>,              // novo
  is_vendeu: true | false,           // novo
  motivo_status: "nao-venda perdida" // apenas quando perdeu
  lead_nome, lead_telefone,
  closer_nome, sdr_name,
  agendamento_id, registered_at,
  resumo_venda, valor, motivo_nao_fechamento,
  explicacao_nao_fechamento, follow_up, follow_up_date,
  follow_up_time, observacoes, outcome, status,
  lead_revenue, valor_apresentado,
  recebimento_acordado, valor_previsto, data_prevista
}
```

Para `outcome` diferente de fechou/perdeu, o payload permanece exatamente como hoje.

## Alterações

### 1. `src/services/datacrazyVenda.ts`
- Estender a interface `VendaWebhookPayload` com os campos opcionais: `evento?`, `pipeline_acao?`, `status_novo?`, `timestamp?`, `is_vendeu?`, `motivo_status?`.
- Em `sendVendaToDataCrazy(payload)`:
  - Se `payload.outcome === "fechou"` ou `"perdeu"`, montar `enriched` acrescentando:
    - `evento: "status_atualizado"`
    - `pipeline_acao: "reuniao_realizada"`
    - `status_novo: "realizada"`
    - `timestamp: new Date().toISOString()`
    - `is_vendeu: outcome === "fechou"`
    - `motivo_status: "nao-venda perdida"` quando `outcome === "perdeu"`
  - Enviar `enriched` (ou o `payload` original) para a edge function.

Nenhum call-site (`FollowUpsPage.tsx`, `VendaDialog.tsx`, `VendaPage.tsx`, `AvulsaSaleDialog.tsx`) precisa mudar — o enriquecimento é centralizado no serviço.

### 2. `supabase/functions/datacrazy-venda-webhook/index.ts`
- Nenhuma alteração funcional; o `event: "venda_resultado"` já injetado continua útil para o CRM distinguir do webhook antigo. Os novos campos passam adiante como parte do spread do `payload`.

## Fora de escopo
- Fluxo de `reuniaoRealizada` já existente em `src/services/datacrazy.ts` (dispara webhook `datacrazy-webhook` quando o closer marca reunião como realizada sem venda) — permanece inalterado.
- Retentativas / edge function de proxy.
- Nenhuma mudança de UI.

## Verificação
- `tsgo` (typecheck) após a edição.
- Conferir no console do preview, ao concluir um follow-up como "Fechou" e como "Perdeu", que o payload enviado para `datacrazy-venda-webhook` contém `is_vendeu` e `pipeline_acao: "reuniao_realizada"`.
