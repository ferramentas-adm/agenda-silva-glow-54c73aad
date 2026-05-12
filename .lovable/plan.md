## Mudanças

### 1. Renomear label "Follow-up?" → "Vai acompanhar esse lead?"

Em `src/components/VendaDialog.tsx` (linha 422), trocar o `<Label>Follow-up? *</Label>` por `<Label>Vai acompanhar esse lead? *</Label>`. Manter as opções "Sim" / "Não (venda perdida)".

Como hoje a pergunta só aparece no fluxo "vendeu = não", a mudança fica restrita a esse ponto. Se no futuro a pergunta passar a aparecer também quando vendeu=sim, o label já estará correto.

### 2. Aba "Não acompanhados" em /follow-ups (só Gestor)

Em `src/pages/FollowUpsPage.tsx`:

- Envolver o conteúdo atual numa `<Tabs>` com duas abas, **visível apenas para `isGestor`**:
  - **"Em acompanhamento"** — conteúdo atual (lista `vendas` com `follow_up = true`).
  - **"Não acompanhados"** — lista de `vendas` onde `vendeu = false` AND `follow_up = false` (Closer decidiu não acompanhar).
- Para Moderador/Closer/SDR: render só o conteúdo atual, sem tabs (mantém comportamento).
- A nova aba mostra: lead, telefone, closer responsável (via `agendamentos.closer_id` → `closers.name`), data da reunião, motivo (`motivo_nao_fechamento`) e explicação (`explicacao_nao_fechamento`). Filtros: closer, busca por nome, intervalo de data da reunião. Sem ações de edição — é visualização.

Query: `vendas` join `agendamentos` (igual à query atual), filtrando `vendeu = false` e `follow_up = false`, exclui agendamentos com `deleted_at IS NOT NULL`.

### 3. Painel "Carga por Closer" no Dashboard Comercial (só Gestor)

Em `src/pages/DashboardComercialPage.tsx`, adicionar uma seção/card **visível apenas para Gestor** com uma tabela: uma linha por Closer ativo, colunas:

| Closer | Tarefas atrasadas | Tarefas pendentes (futuras) | Follow-ups atrasados | Follow-ups futuros | Em acompanhamento |
|---|---|---|---|---|---|

Definições (timezone America/Sao_Paulo via `src/lib/timezone.ts`):

- **Tarefas atrasadas**: `tasks` com `assigned_closer_id = closer.id`, `status = 'pendente'`, `due_date < hoje` (ou `due_date = hoje` AND `due_time < agora` se houver due_time).
- **Tarefas pendentes (futuras)**: `tasks` `status = 'pendente'`, `due_date >= hoje` (descontando as atrasadas) + sem due_date.
- **Follow-ups atrasados**: `vendas` com `follow_up = true`, `agendamentos.closer_id = closer.id`, `follow_up_date < hoje` (ou hoje + horário passado).
- **Follow-ups futuros**: `vendas` `follow_up = true`, `follow_up_date >= hoje`, descontando atrasados.
- **Em acompanhamento**: total de `vendas` `follow_up = true` para aquele closer.

Ordenação default: maior número de atrasados primeiro. Linhas com atrasados destacadas (texto em `text-destructive`). Sem drilldown nesta etapa.

Fica num `<Card>` próprio com título "Carga por Closer", logo após as métricas existentes.

## Permissões

- Aba "Não acompanhados" e seção "Carga por Closer" só renderizam se `role === 'gestor'`.
- RLS atual já permite Gestor ler `vendas`, `agendamentos`, `tasks`, `closers` — sem mudanças de RLS.

## Fora de escopo

- Sem mudanças em schema, edge functions, webhooks ou na lógica de criação de venda.
- Sem drilldown clicável nas células do painel (pode vir depois).
- Sem mudança no fluxo do `OverdueMeetingsLockOverlay`.
