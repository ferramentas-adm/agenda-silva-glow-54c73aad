## O que vai mudar

### 1. Renomear "Carga Closers" → "Follows Closer"
- `src/pages/DashboardComercialPage.tsx` linha 37: trocar label da aba (mantém key `carga` e arquivo `CargaClosersTab.tsx`).
- `src/components/dashboard/CargaClosersTab.tsx` linha ~271: trocar título "Carga por Closer" → "Follows por Closer".

### 2. Liberar Dashboard Comercial completo para Moderador
A rota `/dashboard-comercial` já aceita Moderador (`requireAdmin`). Falta só liberar as abas internas:
- `DashboardComercialPage.tsx`:
  - Linha 88: `const isAdmin = role === "gestor" || role === "moderador";`
  - Linha 90: filtrar tabs por `isAdmin` em vez de `isGestor`.
  - Linhas 583-584: renderizar `CargaClosersTab` e `ErrosSDRTab` com `isAdmin`.

### 3. Liberar gestão de usuários para Moderador (exceto mexer em Gestores)
**Frontend (`AdminPage.tsx`):**
- Trocar todas as `{isGestor && ...}` da seção de usuários por `{canManageUsers && ...}`, onde `canManageUsers = isGestor || isModerador`.
- Para cada ação destrutiva/sensível em uma linha de usuário (ativar/desativar, alterar função, alterar senha, redefinir senha, editar, excluir, DataCrazy ID), adicionar guarda extra: **esconder se Moderador E `u.role === "gestor"`**.
- No formulário "Novo Usuário" liberar para Moderador, mas remover a opção `"gestor"` do `<Select>` quando o caller for Moderador.
- No diálogo de troca de função, remover opção `"gestor"` quando caller for Moderador.

**Backend (`supabase/functions/manage-user/index.ts`):**
- Função já aceita `gestor` ou `moderador`. Adicionar verificação: se `caller` for Moderador, buscar role do `user_id` alvo; se for `gestor`, retornar 403. Aplicar para todas as actions (`delete`, `toggle_active`, `change_password`, `change_role`, `toggle_scheduling`).
- Em `change_role`, bloquear `new_role === "gestor"` para Moderador.
- Em `create-user/index.ts` (criar novo): mesma regra — Moderador não pode criar `gestor`.

### 4. Atualizar memória do projeto
Atualizar `mem://auth/roles-and-users` refletindo: Moderador agora cria/edita/exclui usuários (exceto Gestores) e enxerga Dashboard Comercial completo.

## Detalhes técnicos

- Sem mudança de schema, sem migração.
- RLS atual já cobre: `user_roles` permite Moderador SELECT, manage-user roda com service role.
- Enforcement de "não mexer em Gestor" fica em **dois lugares** (UI esconde + edge function bloqueia) — defesa em profundidade.
- Não renomeio arquivos (`CargaClosersTab.tsx`, key `"carga"`, queryKeys) — só labels visíveis, conforme escolhido.
