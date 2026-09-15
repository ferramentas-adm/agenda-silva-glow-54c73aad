# Dropdown de troca/transferência de closer: todas as turmas com selo A/B

## Problema confirmado
O dropdown "Closer" do card **Detalhes do agendamento** usa a lista `closers` do hook `useCloserFilter`, que na verdade devolve `visibleClosers` — já filtrada pela Turma escolhida no calendário. Com "Turma B" selecionada, só aparecem closers da Turma B, impedindo transferir um lead qualificado para a Turma A.

## O que muda

### 1. Calendário — card "Detalhes do agendamento" (`src/pages/DashboardPage.tsx`)
- O hook `useCloserFilter` passa a expor também `allClosers` (lista completa, sem filtro de turma), com `em_treinamento`.
- O dropdown "Closer" do card usa `allClosers`, mostrando **todos os closers ativos**, com um selo ao lado do nome:
  - `Nome do closer` + badge **A** (closer normal) ou **B** (em treinamento).
- Trava de compatibilidade (a mesma que o banco já impõe): se o closer escolhido for de turma incompatível com o lead (lead qualificado → Turma B, ou lead desqualificado → Turma A), a troca é bloqueada com aviso claro em vez de falhar com erro genérico.

### 2. Calendário — diálogo "Transferir lead" (`src/pages/DashboardPage.tsx`)
- A consulta `transferable-closers` passa a trazer `em_treinamento` e o dropdown mostra todos os closers com o mesmo selo **A**/**B**, independente do filtro de turma da tela.
- Mesma trava de compatibilidade com aviso.

### 3. Lista de reuniões (`src/pages/ReunioesListPage.tsx`)
- O dropdown de closer da tabela (já lista todos) passa a mostrar o selo **A**/**B** ao lado de cada nome.

## O que NÃO muda
- Regra de negócio: lead qualificado só vai para Turma A; desqualificado só para Turma B (trigger do banco mantido).
- Filtro Turma A/B do calendário continua igual.
- Nenhuma mudança em funções de backend, Meet, mensagens ou integrações.

## Detalhes técnicos
- `src/hooks/useCloserFilter.ts`: novo retorno `allClosers` (= lista crua da query, antes do filtro de turma/papel).
- Badge: componente pequeno inline (ex.: `<Badge>` outline) com letra A/B — A com cor primária, B em âmbar, seguindo o padrão do toggle do Admin.
- Validação no cliente antes de chamar `handleChangeCloser` / `handleTransferLead` / `handleTransferCloser`: compara `lead_desqualificado` do agendamento com `em_treinamento` do closer destino; em conflito, `toast.error` explicando e sem gravar.
- Sem migração de banco; build + `git diff --check` ao final.
