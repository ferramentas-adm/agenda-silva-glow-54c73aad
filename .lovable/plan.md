## Objetivo
Criar uma nova função **Apresentador** com acesso de **somente visualização** a todas as áreas do sistema (Calendário, Reuniões, Follow-ups, Dashboard Comercial, Dashboard Leads, Pagamentos, Auditoria e Configurações). Nenhuma ação de escrita (criar, editar, excluir, atribuir, mover status, etc.) será permitida — nem no UI nem no banco.

## Escopo
- **Somente a função** será criada agora. A criação de usuários Apresentadores será feita depois pela tela de Administração usando a função já existente.
- Não altera nenhuma função existente (gestor, moderador, supervisor, closer, sdr).

## Alterações

### 1. Banco de dados (migração)
- Adicionar `'apresentador'` ao enum `app_role`.
- Popular `role_permissions` para a nova role: apenas permissões de **visualização** ligadas — `view_calendar`, `view_meetings`, `view_follow_ups`, `view_dashboard_comercial`, `view_dashboard_leads`, `view_payments`, `view_admin` (para conseguir abrir a matriz em modo leitura? — **não**, deixaremos `view_admin=false` para não expor configurações), `view_audit_logs`. Todas as permissões de ação (`manage_tasks`, `manage_payments`, `create_appointment`, `edit_appointment_time`, `assign_closer`) ficam **desligadas**.
- Ajustar políticas RLS para dar leitura ao apresentador nas tabelas relevantes (`agendamentos`, `vendas`, `pagamentos`, `closers`, `profiles`, `tasks`, `lead_metrics`, `audit_logs`, `notifications`, `closer_error_reviews`, `closer_blocks`) sem permitir INSERT/UPDATE/DELETE. Concretamente: adicionar policies `FOR SELECT USING (has_role(auth.uid(),'apresentador'))` onde a leitura hoje é restrita a gestor/moderador/supervisor.

### 2. Frontend
- **`src/contexts/AuthContext.tsx`**: incluir `"apresentador"` no tipo `AppRole` e expor `isApresentador`.
- **`src/hooks/usePermissions.ts`**: adicionar `"apresentador"` em `AppRole` e em `ALL_ROLES` (para aparecer na matriz).
- **`src/components/admin/PermissionsMatrix.tsx`**: adicionar rótulo `Apresentador` em `ROLE_LABELS`. A matriz já renderiza dinamicamente a partir de `ALL_ROLES`, então a coluna surge sozinha.
- **`supabase/functions/create-user/index.ts`**: aceitar `"apresentador"` na lista de roles válidas; bloquear criação de usuários dessa função por não-gestores? Vamos manter a mesma regra: moderador pode criar Apresentador (só gestor não pode ser criado por moderador). Não cria linha em `closers`.
- **`src/pages/AdminPage.tsx`** (formulário de novo usuário): adicionar `"Apresentador"` como opção do select de função.
- Revisar componentes que checam role diretamente (`isGestor || isModerador || isSupervisor`) em botões de ação para garantir que o Apresentador **não** veja botões de escrita mesmo se a permissão de visualização estiver ligada. Alvos principais já usam `useCan(...)` da matriz, então a maior parte é automática; ajustes pontuais apenas onde a role é checada "na unha".

### 3. Memória do projeto
Atualizar `mem://auth/roles-and-users` com a nova função Apresentador (somente leitura em toda a ferramenta, sem criar/editar/excluir nada).

## Fora do escopo
- Criar um usuário Apresentador específico (será feito pela tela de Administração depois).
- Alterar permissões das funções existentes.

## Verificação
- Migração aplicada e enum atualizado.
- Ao logar como Apresentador: menus de todas as áreas visíveis, dados carregam, botões "Novo", "Editar", "Excluir", "Atribuir", "Registrar venda", "Marcar como…" ficam ocultos ou desabilitados.
- Tentativa direta de INSERT/UPDATE via API falha por RLS.
