## Revisão de Erros do Closer (Gestor → Moderadores)

Espelhar o fluxo já existente de "Erros SDR", mas com origem no drilldown de "Motivos de não fechamento" e classificação feita pelo **Gestor**. Tudo dentro da aba **"Erros"** existente, com sub-abas SDR / Closer.

### 1. Banco — nova tabela `closer_error_reviews`
- `agendamento_id` (uniq, FK), `closer_id`, `venda_id`
- `classification`: enum `closer_error` | `acerto`
- `error_description` (texto, obrigatório quando `closer_error`)
- `reviewed_by` (uuid gestor), `reviewed_at`
- `feedback_given` (bool), `feedback_by`, `feedback_at`, `feedback_notes` (opcional)
- RLS: gestor INSERT/UPDATE da classificação; moderador/gestor marcam feedback; autenticados SELECT. GRANTs padrão.

### 2. Drilldown "Motivos de não fechamento" (`MetricDrilldownDialog.tsx`)
Em cada card de lead, quando o usuário é **gestor**, mostrar dois botões no topo:
- **"Erro do Closer"** (vermelho) → abre modal para digitar a descrição e confirmar.
- **"Foi acerto"** (verde) → confirma direto.

Regras:
- Após classificar, os botões somem e aparece um badge "Erro do Closer registrado" ou "Marcado como acerto" (gestor + data). Sem reclassificar pelo drilldown — assim o gestor identifica facilmente o que ainda falta revisar.
- Perfis não-gestor: nenhum botão, apenas o badge se já houver review.

### 3. Aba "Erros" — adicionar sub-abas
Reestruturar a aba existente (hoje só SDR) em duas sub-abas internas:
- **Erros SDR** — conteúdo atual de `ErrosSDRTab.tsx` intacto.
- **Erros Closer** — novo painel.

Painel "Erros Closer" (espelha o de SDR):
- Filtro por período e por Closer.
- Cards-resumo por Closer: total de erros, feedbacks dados, pendentes.
- Abas internas: "Pendentes de feedback" / "Feedback dado".
- Acordeão por Closer → lista de leads com briefing do SDR, explicação do "porquê não fechou", erro descrito pelo gestor, autor/data.
- Botão **"Marcar feedback dado"** (moderador/gestor), com campo opcional de notas.

### 4. Detalhes técnicos
- Novo `ErrosCloserTab.tsx` + `CloserErrorDetailsDrawer.tsx` baseado nos equivalentes de SDR.
- Wrapper `ErrosTab.tsx` (ou ajuste no container atual) com `<Tabs>` SDR/Closer.
- Query principal: `closer_error_reviews` ↔ `agendamentos` ↔ `vendas` ↔ `closers` ↔ `profiles`.
- Invalidar queries do drilldown e da aba ao classificar / marcar feedback.
- Permissão: `usePermissions` + `has_role('gestor')` para mostrar os botões de classificação; moderador vê e dá feedback.

### Fora de escopo
- Não altera CRM / webhooks DataCrazy.
- Não mexe na lógica interna do fluxo de Erros SDR.
