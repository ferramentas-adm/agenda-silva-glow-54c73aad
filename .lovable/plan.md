# Filtro de Turma A/B na Torre de Controle

A Torre de Controle hoje mostra as reuniões de todos os closers, sem distinção de turma. Adicionar o mesmo filtro usado no calendário principal (Todos / Turma A / Turma B) para facilitar o acompanhamento operacional.

## O que muda

- **`src/components/calendar/TorreControleDialog.tsx`** (único arquivo):
  - A consulta passa a trazer `closers(id, name, em_treinamento)` — a turma do closer já é `em_treinamento` (false = Turma A, true = Turma B), igual ao calendário.
  - Novo filtro com 3 botões: **Todos**, **Turma A**, **Turma B**, junto dos botões de navegação de hora.
  - O filtro vale para a lista da hora **e** para os resultados da lupa de busca (busca do dia inteiro respeita a turma escolhida).
  - Os contadores de presença no topo passam a refletir apenas as reuniões exibidas.
  - Reunião sem closer atribuído aparece somente com "Todos".

Nenhuma outra regra, consulta ou tela é alterada. Build e verificação no preview ao final.
