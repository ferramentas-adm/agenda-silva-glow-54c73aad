# Enviar dados de venda enriquecidos ao DataCrazy + backfill histórico

## Objetivo
1. Garantir que o payload enviado ao `datacrazy-venda-webhook` contenha os 3 campos que você vai mapear no CRM: **Motivo de Não Fechamento**, **Explicação do Não Fechamento** e **Observações**.
2. Permitir reenvio em lote (backfill) das vendas registradas a partir de **01/05/2026**, respeitando o limite de **100 requests/min** do webhook.
3. Antes do lote grande, fazer **um envio de teste** com 1 registro para você conferir o JSON dentro do DataCrazy e mapear os campos.

## Etapa 1 — Conferir/garantir o payload
O payload atual de `sendVendaToDataCrazy` já inclui `motivo_nao_fechamento`, `explicacao_nao_fechamento` e `observacoes`. Vou apenas:
- Confirmar que esses 3 campos sempre são enviados (mesmo `null`) para o flow do DataCrazy poder mapear sem variações.
- Acrescentar `event: "venda_resultado"` + um marcador `source: "backfill" | "live"` para você diferenciar no flow se quiser.

Nada muda no fluxo ao vivo a não ser a garantia das chaves.

## Etapa 2 — Edge function `datacrazy-backfill-vendas`
Nova edge function que:
- Recebe `{ start_date, end_date?, only_with_motivo?, dry_run?, limit? }`.
- Lê de `vendas` (join com `agendamentos` para pegar `lead_name`, `lead_phone`, `closer_id`, `sdr_responsavel_id/created_by`) onde `agendamento.scheduled_date >= start_date` e `agendamento.status = 'realizada'`.
- Para cada linha monta o mesmo payload do fluxo ao vivo (`VendaWebhookPayload`) e dispara para o webhook do DataCrazy.
- **Rate limit interno**: dispara em janelas de 60 segundos, no máximo **90 req/min** (margem de segurança). Implementado com um loop `for…of` + `setTimeout` baseado em contagem por janela.
- Registra cada envio em `audit_logs` (`action: 'datacrazy_backfill'`) com `success/fail` e mensagem.
- Resposta em streaming/chunked não — retorna ao final `{ total, sent, failed, errors[] }`. Para acompanhar progresso a UI faz polling em `audit_logs`.
- Modo `dry_run: true` retorna a contagem que seria enviada sem disparar nada.
- Modo `limit: 1` para o **envio de teste inicial**.

Acesso: somente role `gestor` (verifica via `getClaims` + `has_role`).

## Etapa 3 — UI em `/admin`
Novo card **"Sincronização DataCrazy — Backfill de vendas"** visível só para gestor:
- Campo data inicial (default 2026-05-01) e final (opcional).
- Checkbox "Somente com motivo de não fechamento preenchido".
- Botão **"Pré-visualizar"** → chama dry_run, mostra quantas vendas entram.
- Botão **"Enviar 1 teste"** → dispara com `limit: 1` (mais antiga do filtro) para você mapear no DataCrazy.
- Botão **"Reenviar todas"** → confirmação modal + dispara em lote. Mostra progresso lendo `audit_logs` a cada 5s (total enviado / falhas) até concluir.
- Histórico das últimas 5 execuções (do `audit_logs`).

## Etapa 4 — Roteiro de uso
1. Você abre `/admin` → clica **Pré-visualizar** → confere o total.
2. Clica **Enviar 1 teste** → DataCrazy recebe 1 payload. Você mapeia os 3 campos no flow.
3. Confirmando o mapeamento, clica **Reenviar todas** → backfill respeitando 90 req/min (≈12 min para 1000 vendas).
4. Daqui pra frente o fluxo ao vivo continua enviando automaticamente em cada nova venda registrada.

## Detalhes técnicos
- Sem nova coluna em `vendas` (você pediu botão manual, não cron). Se depois quiser deduplicação automática, dá pra adicionar `datacrazy_synced_at` numa etapa futura.
- A edge function reusa exatamente o builder de payload já usado em `VendaFormDialog`/`sendVendaToDataCrazy` para garantir paridade.
- `verify_jwt = true` na função (apenas gestor logado pode chamar).
- Logs ficam visíveis em **Lovable Cloud → Functions → datacrazy-backfill-vendas** e no card do `/admin`.

## Arquivos afetados
- `supabase/functions/datacrazy-backfill-vendas/index.ts` (novo)
- `src/services/datacrazyVenda.ts` (extrair builder de payload reutilizável; garantir 3 chaves sempre presentes)
- `src/pages/AdminPage.tsx` ou componente equivalente — adicionar card de backfill
- `src/components/admin/DatacrazyBackfillCard.tsx` (novo)
