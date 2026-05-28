## Diagnóstico

Hoje quando um SDR reagenda uma reunião, o sistema cria DOIS registros:
- **Original** (na data antiga): `status='reagendada'`, `original_agendamento_id=null` → aparece como "Reagendada" no calendário.
- **Novo** (na data nova): `status='reagendada'`, `original_agendamento_id=<id antigo>` → aparece como **"Confirmada"** no calendário (via `getEffectiveStatus`), **sem passar pelo fluxo de confirmação**.

Isso quebra duas coisas:
1. Reuniões aparecem como "Confirmada" sem terem sido de fato confirmadas pelo lead.
2. As métricas SDR contam essas reuniões como "Reagendado" (status real), não "Confirmado" (visual), gerando inconsistência.
3. Quando vencem, o overlay de bloqueio só pegava se `status IN ('agendada','confirmada')` — quem ficou como reagendada+original_id escapava (fix anterior tentou cobrir, mas adiciona complexidade).

Confirmei no banco: **38 registros** atuais nessa situação (todos `reagendada` + `original_id`), em datas passadas — Neto, Igor, Pedro Ferro, Padilha, André, Pedro Vieira. Por isso esses Closers não estão sendo bloqueados.

## Decisão (sua)

Reagendamento NOVO entra como **`agendada`** e precisa passar pelo fluxo de confirmação de novo — não nasce "Confirmada".

## Plano

### 1. Migration: corrigir dados existentes
Backfill: todos os 38 agendamentos `reagendada` + `original_id NOT NULL` (não deletados) viram `agendada`.

```sql
UPDATE agendamentos
SET status = 'agendada'
WHERE status = 'reagendada'
  AND original_agendamento_id IS NOT NULL
  AND deleted_at IS NULL;
```

### 2. Trigger `detect_and_mark_reschedule()`
Hoje seta `NEW.status='reagendada'` quando detecta reagendamento. Mudar para **apenas** setar `NEW.original_agendamento_id` (mantém status default `agendada`).

### 3. Trigger `notify_status_change_webhook()`
DataCrazy precisa continuar recebendo "Reagendada" pra esses novos registros (compatibilidade CRM). No bloco do `INSERT`, se `original_agendamento_id IS NOT NULL`, enviar `status_display = 'Reagendada'` mesmo o `status` sendo `'agendada'`.

### 4. Trigger `enforce_initial_agendamento_status()`
Hoje converte `confirmada → agendada` no INSERT. Sem mudanças.

### 5. `src/pages/AgendarPage.tsx` (linha 319 e 333-343)
- Linha 319: trocar `status: editId ? "reagendada" : "agendada"` por sempre `status: "agendada"`.
- Manter o `UPDATE` do original para `reagendada` (linhas 335-343).

### 6. Remover `getEffectiveStatus`
Não existe mais o caso "reagendada com original_id". Limpar de:
- `src/pages/DashboardPage.tsx` (função no topo + usos em `statusCounts`/`allStatusCounts`)
- `src/components/dashboard/ProdutividadeSDRTab.tsx` (mesma função)

`statusCounts` passa a usar `agendamento.status` direto.

### 7. `src/hooks/useOverdueMeetings.ts`
- Linha 87: voltar para `.in("status", ["agendada", "confirmada"])`.
- Linhas 100-104: remover o filtro extra de `reagendada + original_id`.
- Tirar `original_agendamento_id` do SELECT (não é mais necessário).

### 8. Métricas SDR e cards
Nenhuma mudança de lógica. Como os reagendamentos novos viram `agendada`, eles aparecem automaticamente em:
- Card "Sem confirmar" / "Agendado" (Dashboard e Métricas)
- Contagens de "Total agend. dia" (já incluem agendada)

O card "Reagendado" passa a contar **apenas** o lado original do reagendamento (que é o comportamento correto — uma reunião reagendada, contada uma vez).

### 9. Validação pós-deploy
- Conferir no banco: `SELECT COUNT(*) FROM agendamentos WHERE status='reagendada' AND original_agendamento_id IS NOT NULL` deve dar **0**.
- Neto, Igor, Pedro Ferro, André devem ser bloqueados no próximo login (38 reuniões antigas viram `agendada` e o overlay pega).
- Métricas SDR de Maio passam a mostrar essas 38 em "Agendado" (e elas terão que ser resolvidas pelos Closers via overlay).

## Arquivos afetados

- **Migration nova** (schema + data): trigger `detect_and_mark_reschedule`, trigger `notify_status_change_webhook`, backfill dos 38 registros.
- `src/pages/AgendarPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/components/dashboard/ProdutividadeSDRTab.tsx`
- `src/hooks/useOverdueMeetings.ts`

## Observação

Após esse fix, os Closers que voltarem a abrir o sistema vão se deparar com o overlay de bloqueio listando TODAS as reuniões pendentes (Neto vai ver 3, Igor várias, etc). Eles precisarão resolver cada uma (Realizada / No-show / Cancelada) antes de continuar usando. Esse é exatamente o comportamento que você pediu.
