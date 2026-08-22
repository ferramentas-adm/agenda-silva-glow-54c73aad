# Exibir Lead ID ao lado do nome do lead no modal de detalhes

## Contexto
O modal de detalhes do agendamento (tela Calendário / `DashboardPage.tsx`) exibe o nome do lead no título, mas não mostra o `Lead ID` cadastrado no DataCrazy (`meta_lead_id`). O usuário pediu para exibir esse campo ao lado do nome do lead.

## Alterações previstas

1. **Tipagem do agendamento**
   - Adicionar `meta_lead_id?: string | null` na interface `Agendamento` de `src/pages/DashboardPage.tsx`.

2. **Carga de dados**
   - Incluir a coluna `meta_lead_id` na query `useQuery` que busca os agendamentos do dia (`.select(...)`).

3. **UI do modal**
   - No `DialogTitle` do modal de detalhes, renderizar o `Lead ID` ao lado do nome do lead quando presente.
   - Usar um estilo discreto (ex.: badge ou texto menor com cor `text-muted-foreground`) para não competir com o nome.

## Fora de escopo
- Não alterar o fluxo de agendamento nem a busca do Lead ID no DataCrazy.
- Não adicionar o campo em outras telas (ex.: `LeadDetalhesPage`) a menos que solicitado.

## Validação
- Abrir o modal de detalhes de um agendamento que tenha `meta_lead_id` preenchido e confirmar que o ID aparece ao lado do nome.
- Verificar que agendamentos sem `meta_lead_id` continuam exibindo apenas o nome, sem quebra visual.