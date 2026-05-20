## O que vai ser feito

Quando um horário (ex.: 14:00 de 22/05) já tiver atingido o limite de agendas ativas considerando **todos os closers**, o SDR não consegue mais marcar nesse slot. Gestor/moderador continuam podendo forçar. O aviso é visível **direto no calendário de horários**, sem precisar clicar.

## Configuração

Nova entrada em `app_settings`:
- `agenda_slot_limit` (default `9`) — quantas agendas ativas cabem por horário no total.

Editável pela tela de Admin (gestor), seguindo o mesmo padrão das outras settings existentes (`useAppSettingList` / `APP_SETTING_KEYS`).

## Regra de contagem

Para um `scheduled_date` + `scheduled_time`, conta todos os `agendamentos` onde:
- `deleted_at IS NULL`
- `status NOT IN ('cancelada')` — inclui agendada, confirmada, realizada, no_show, reagendada (ou seja: tudo exceto canceladas/deletadas, conforme você escolheu).

## TimeSlotPicker (tela de Agendar)

Novo query: busca a **contagem por horário do dia inteiro** para o `dateStr` selecionado, agrupada por `scheduled_time`, sem filtrar por closer. Reaproveita o mesmo cache para todos os slots.

Cada botão de slot ganha um indicador visual baseado na contagem `n`:

```text
n < limite-2     → normal
n = limite-2/-1  → badge âmbar com "n/9" (quase lotado)
n >= limite      → fundo vermelho, ícone de cadeado, texto "Lotado n/9"
```

Para **SDR**: slot lotado fica `disabled` e clicar abre AlertDialog "Horário lotado — todos os closers já estão ocupados nesse horário. Escolha outro horário."

Para **gestor/moderador**: slot lotado fica visualmente vermelho mas **clicável**, com tooltip "Lotado — forçar agendamento" e um AlertDialog de confirmação antes de prosseguir.

A legenda no topo ganha mais um item: 🔒 vermelho = "Lotado (limite atingido)".

O botão "Outro" (horário customizado) também valida contra o limite na confirmação, com o mesmo bloqueio para SDR.

## Dashboard Comercial

Novo card "Horários lotados hoje" (visível para gestor/moderador/SDR), listando os horários do dia atual que atingiram o limite, com a contagem. Posicionado próximo aos cards de produtividade já existentes em `DashboardComercialPage`.

## Detalhes técnicos

**Migração**: 
```sql
INSERT INTO app_settings (key, value) 
VALUES ('agenda_slot_limit', '9')
ON CONFLICT (key) DO NOTHING;
```

**Hook novo** `useSlotCounts(dateStr)` em `src/hooks/useSlotCounts.ts`:
- Query agrupada por `scheduled_time` para o dia inteiro
- Retorna `Map<string, number>` (chave = "HH:MM")
- `staleTime: 30s`, invalidada após criar agendamento

**Arquivos a alterar**:
- `supabase/migrations/...` — seed da setting
- `src/components/admin/...` (tela de settings, se existir lista — adicionar `agenda_slot_limit` em `APP_SETTING_KEYS`)
- `src/hooks/useSlotCounts.ts` — novo
- `src/components/agendar/TimeSlotPicker.tsx` — consome contagem, aplica estilo/bloqueio, AlertDialogs (lotado vs forçar)
- `src/pages/AgendarPage.tsx` — invalidar `useSlotCounts` no submit
- `src/pages/DashboardComercialPage.tsx` — card de horários lotados hoje

**Permissões**: o bloqueio é client-side por role; não criamos constraint no banco (gestor precisa poder forçar). Mantém comportamento atual de RLS.
