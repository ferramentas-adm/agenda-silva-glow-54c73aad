## Resumo dos 3 ajustes

1. Remover permissão de **closer** para excluir reuniões (UI + RLS).
2. Auditoria completa de **agendamentos** via triggers no banco (criação, edição, exclusão), guardando `user_id`, `user_email` e `user_name` — front exibe apenas `user_name`.
3. Liberar **/dashboard-comercial → aba Vendas** para closers, com dados travados nos próprios números.

---

## 1) Closer não pode mais excluir reuniões

**Frontend**
- `src/pages/DashboardPage.tsx` (calendário): hoje qualquer perfil chama `setDeleteTarget(ag)` no slot do agendamento. Adicionar gate `const canDelete = role === "gestor" || role === "moderador"` e só renderizar o botão `Trash2` (linhas ~703-711 e ~1783) quando `canDelete`. Passar `onDelete={canDelete ? setDeleteTarget : undefined}` em todos os call sites.
- `src/pages/ReunioesListPage.tsx`: já tem `canDelete = isGestor || isModerador` — sem mudança.

**Backend (defesa em profundidade)**
Adicionar trigger `BEFORE UPDATE` em `agendamentos` que bloqueia qualquer usuário que não seja `gestor`/`moderador` de setar `deleted_at` de `NULL` para um valor:

```sql
CREATE OR REPLACE FUNCTION public.block_non_admin_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    IF NOT (public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'moderador')) THEN
      RAISE EXCEPTION 'Apenas gestores e moderadores podem excluir agendamentos';
    END IF;
  END IF;
  RETURN NEW;
END $$;
```

---

## 2) Auditoria geral de agendamentos via triggers

**Migração de schema em `audit_logs`**
- Adicionar coluna `user_email TEXT NULL`.
- Manter `user_name`; front continuará exibindo só `user_name` (a coluna `user_email` fica disponível para investigação/CSV futuro, mas não é renderizada).

**Trigger único em `agendamentos`** (`AFTER INSERT OR UPDATE`, `SECURITY DEFINER`) que insere em `audit_logs`:

| Evento | `action` | `details` (chaves principais) |
|---|---|---|
| INSERT (1ª reunião / reagendamento) | `create_agendamento` | lead_name, closer_name, scheduled_date, scheduled_time, channel_type, meeting_reason, original_agendamento_id |
| UPDATE status | `update_status` | old_status, new_status, lead_name, scheduled_date, scheduled_time |
| UPDATE `deleted_at` (NULL → valor) | `delete_agendamento` | lead_name, closer_name, scheduled_date, scheduled_time, deletion_reason |
| UPDATE em campos relevantes | `edit_agendamento` (um log por campo alterado) | field, from, to, lead_name, scheduled_date |

Campos monitorados em UPDATE: `closer_id`, `sdr_responsavel_id`, `scheduled_date`, `scheduled_time`, `briefing`, `observation`, `channel_type`, `meeting_reason`, `meet_link`, `duration_minutes`, `is_5k`, `cancellation_reason`. Resolve `closer_id`→`closers.name` e `*_user_id`→`profiles.full_name` antes de gravar.

**Identidade do ator no log**: cada linha inserida pelo trigger preenche
```
user_id    = auth.uid()
user_email = (select email from auth.users where id = auth.uid())
user_name  = coalesce((select full_name from profiles where user_id = auth.uid()), user_email, 'Sistema')
```

**Limpeza no front (evita duplicidade com trigger)**
Em `src/pages/DashboardPage.tsx` e `src/pages/ReunioesListPage.tsx`, remover as chamadas redundantes a `logAudit` para: `create_agendamento`, `edit_agendamento` (closer/sdr/horário/briefing/canal/observação), `update_status`, `delete_agendamento`. **Manter** `read_briefing` e `transfer_lead` (não são UPDATEs simples e queremos o rótulo dedicado). `src/pages/AgendarPage.tsx` também perde o `logAudit("create_agendamento", …)`.

**Front: `AuditLogsPage`**
Sem mudança visual — já lista `user_name`, `action`, `entity_type`, `details`. `user_email` fica oculto.

---

## 3) Closer acessa /dashboard-comercial → aba "Vendas" (apenas próprios números)

**Roteamento**
- `src/App.tsx`: trocar `<ProtectedRoute requireAdmin>` por `<ProtectedRoute>` em `/dashboard-comercial`. Controle de acesso passa a ser por permissão.

**Permissão / menu**
- Inserir em `role_permissions`: `(closer, view_dashboard_comercial, true)`. AppLayout já exibe o item "Dashboard" quando `can("view_dashboard_comercial")`.

**`src/pages/DashboardComercialPage.tsx`**
- Quando `role === "closer"`:
  - Forçar `allowedTabs` a conter **apenas** `{ key: "vendas" }`.
  - Forçar `activeTabKey = "vendas"` e bloquear troca.
  - Esconder o botão `Play/Pause` (auto-rotação) e o popover de visibilidade de abas.
- Demais perfis continuam vendo a lista atual.

**`src/components/dashboard/VendasTab.tsx`**
- Recuperar `myCloserId` via `closers.email == auth.email()` (mesmo padrão de `DashboardPage`).
- Quando `role === "closer"`:
  - Em `vendasDia`, filtrar adicionalmente por `agMap.get(v.agendamento_id)?.closer_id === myCloserId`.
  - Em `proximosFollowUps`, mesmo filtro por `closerId`.
  - Esconder os seletores **"Closer"** (motivos, follow-ups) e o filtro `motivosCloserFilter` — sempre travado em `myCloserId`.
  - "Performance por Closer" só lista o card do próprio closer.
  - KPIs (Taxa, Coletado, Vendas, Follow-ups) recalculam naturalmente sobre `vendasDia` já filtrado.
- RLS de `vendas`/`agendamentos`/`pagamentos` já permitem `SELECT` para autenticados — sem mudança no banco.

---

## Arquivos afetados

- Migração: nova trigger `block_non_admin_soft_delete`, coluna `audit_logs.user_email`, trigger de auditoria em `agendamentos`, função `log_agendamento_change`.
- Insert de dados: `role_permissions` (closer + view_dashboard_comercial).
- `src/App.tsx` — rota `/dashboard-comercial`.
- `src/pages/DashboardComercialPage.tsx` — gating por role.
- `src/components/dashboard/VendasTab.tsx` — filtro por `myCloserId`.
- `src/pages/DashboardPage.tsx` — esconde lixeira para closer; remove `logAudit` redundantes.
- `src/pages/ReunioesListPage.tsx` — remove `logAudit` redundantes.
- `src/pages/AgendarPage.tsx` — remove `logAudit("create_agendamento")`.
