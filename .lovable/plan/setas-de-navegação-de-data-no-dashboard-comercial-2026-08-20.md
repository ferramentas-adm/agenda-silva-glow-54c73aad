# Setas de navegação de data no Dashboard Comercial

Voltar os botões de seta ao lado do filtro de data/intervalo, para andar rapidamente entre datas passadas e futuras sem abrir o calendário.

## Como vai funcionar

- Seta esquerda (anterior) e seta direita (próximo), uma de cada lado do seletor de data, junto do botão de atualizar.
- Quando o filtro está em **um único dia**: as setas avançam/recuam 1 dia.
- Quando o filtro está em **intervalo** (ex.: 01/08 a 19/08): as setas deslocam o intervalo inteiro pelo mesmo tamanho de dias, mantendo a duração (ex.: volta para 13/07 a 31/07).
- Um botão "Hoje" não será adicionado — mantém o cabeçalho enxuto como está hoje.
- A comparação selecionada no filtro (período anterior etc.) é preservada ao navegar.
- Todos os gráficos e cards continuam presos ao mesmo filtro global, então atualizam juntos ao clicar nas setas.

## Detalhes técnicos

- Arquivo: `src/pages/DashboardComercialPage.tsx`, bloco "Date nav" (linhas ~614-643).
- Adicionar dois `Button variant="ghost" size="icon"` com `ChevronLeft` / `ChevronRight` (ícones já importados) ao redor do `FacebookDateRangePicker`.
- Handler único `shiftPeriod(direction: -1 | 1)`: calcula os dias do período atual (`dateRange` ou `currentDate`), usa `addDays` para deslocar e reaplica a mesma lógica de estado já usada no `onChange` do picker (`setCurrentDate` + `setDateRange(undefined)` para dia único, ou `setDateRange({from,to})` para intervalo).
- Sem mudanças de dados, queries ou backend.
