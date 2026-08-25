# Remover "É 2ª reunião" e renomear "Projeto 5K" para "Mentoria com Antônio"

## O que muda

1. **Tirar o toggle "É 2ª reunião (marcada por Closer)"** da tela Novo Agendamento (visível para gestor/moderador/supervisor). Sem ele, o fluxo do admin passa a ser sempre o normal: escolher o SDR responsável (ou assumir como SDR) e informar o Tipo de Canal.
2. **Renomear o rótulo "Projeto 5K" para "Mentoria com Antônio"** na tela de agendamento e nos lugares onde aparece a etiqueta: detalhes do agendamento, cartões do calendário e lista de Aguardando Atribuição. A etiqueta curta "5K" no cartão do calendário passa a ser "MA".
3. **A flag continua existindo** — é o mesmo campo no banco (`is_5k`), apenas com nome novo na interface. Nada de dados é alterado, e agendamentos já marcados continuam marcados.

## Detalhes técnicos

- `src/pages/AgendarPage.tsx`: remover o bloco do Switch `admin-2a-toggle` e o estado `adminAsSecondMeeting` (e as condições que dependiam dele — SDR responsável e Tipo de Canal voltam a ser sempre exibidos para admin). Manter intacta a lógica de 2ª reunião do Closer (`isCloser`) e a herança de canal em reagendamento. Trocar o texto do toggle `is-5k-toggle`.
- `src/pages/DashboardPage.tsx` e `src/pages/AguardandoAtribuicaoPage.tsx`: trocar os textos "Projeto 5K" / "5K" pelos novos rótulos. Sem mudanças em queries.
- Nenhuma migração de banco; `is_5k` permanece nos endpoints (`silva-reunioes`, `silva-vendas`) com o mesmo nome técnico.
