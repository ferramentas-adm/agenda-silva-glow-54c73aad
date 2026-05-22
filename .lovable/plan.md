## Objetivo

Deixar claro na tela de **Configurações → Matriz de Permissões** quais diferenças existem entre **Administrador (Gestor)** e **Moderador** que **não são controláveis pela matriz** (são fixas no código e nas regras de segurança do banco).

## Mudança

Arquivo: `src/components/admin/PermissionsMatrix.tsx`

Adicionar, abaixo do Alert informativo já existente (linha 132), um novo card/alert intitulado **"Diferenças fixas entre Administrador e Moderador"** com uma tabela compacta listando os pontos abaixo. Essas capacidades não aparecem como switches porque são reservadas estruturalmente ao Administrador.

Conteúdo a exibir:

| Capacidade | Administrador | Moderador |
|---|---|---|
| Criar/editar/excluir usuários **Administradores** | ✅ | ❌ |
| Atribuir a função "Administrador" a um usuário | ✅ | ❌ |
| Editar esta **Matriz de Permissões** | ✅ | ❌ (somente leitura) |
| Gerenciar **Closers** (criar, editar, excluir, conectar Google Calendar de terceiros) | ✅ | ❌ |
| Editar **Configurações globais** do sistema (limites de slot, listas dinâmicas) | ✅ | ❌ (somente leitura) |
| Gerenciar **motivos de exclusão/cancelamento** | ✅ CRUD completo | ⚠️ Uso restrito |
| Cadastrar/editar perfis de qualquer usuário e atribuir/remover funções | ✅ | ❌ |

Texto introdutório curto antes da tabela:
> "O Moderador atua como administrador operacional: tem o mesmo acesso ao dia a dia (agendamentos, pagamentos, follow-ups, dashboards e auditoria), mas **não altera a estrutura do sistema**. As capacidades abaixo são exclusivas do Administrador e não podem ser concedidas pela matriz."

## Escopo

- Apenas UI informativa (sem alterar permissões, RLS, ou comportamento).
- Sem mudanças em backend, banco ou outros arquivos.

## Não fazer

- Não transformar essas diferenças em switches editáveis (são restrições de segurança intencionais).
- Não mexer em `usePermissions`, RLS, ou `AdminPage`.
