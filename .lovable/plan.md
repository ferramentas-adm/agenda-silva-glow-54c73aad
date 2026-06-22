## Objetivo
Mostrar no card de "Aguardando atribuição" todas as informações relevantes coletadas em Novo Agendamento, para a head decidir sem abrir outra tela. Excluir 2ª reuniões da lista (Closer agenda pra si mesmo).

## Filtro da lista
- Na query `pending-closer-assignment`, adicionar `.neq("meeting_reason", "segunda_reuniao")` para que 2ª reuniões nunca apareçam aqui.

## Campos a adicionar no card
Hoje aparece: lead, telefone, data/hora, canal, SDR, briefing, observação.

Adicionar:
- **Badge "Projeto 5K"** quando `is_5k = true`.
- **Duração** da reunião (ex.: "60 min").
- **Motivo da reunião** (`meeting_reason`) com rótulo amigável (ex.: "1ª Reunião", "Reagendamento").
- **Indicador de reagendamento** quando `original_agendamento_id` não é nulo, com tooltip mostrando data da original.
- **Histórico do lead** (mesmo telefone): contagem de reuniões anteriores + última situação (realizada / no-show / cancelada / vendida).

## Onde alterar
- `src/pages/AguardandoAtribuicaoPage.tsx`
  - Adicionar filtro `meeting_reason ≠ segunda_reuniao` na query.
  - Ampliar `interface Agendamento` e o `select(...)` para incluir `meeting_reason`, `is_5k`, `original_agendamento_id`.
  - Renderizar os novos badges/linhas no header do card.
  - Query adicional `lead-history-by-phone` para o resumo do histórico.

## Fora de escopo
Edição dos campos, mudança no fluxo de Novo Agendamento, mudança de permissões.