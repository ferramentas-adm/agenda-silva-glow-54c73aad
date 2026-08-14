# Gestor lança a venda em um único passo

## O que está acontecendo

No calendário, quando gestora/moderadora/supervisora muda o status da agenda para **Realizada**, o sistema abre obrigatoriamente o modal do closer ("Resultado da Reunião" — faturamento do lead + Vendeu?). Só depois ela consegue usar **"Registrar / atualizar venda"**. Daí a sensação de preencher duas vezes: uma no lugar do closer e outra como ela.

## Como fica

- Para gestor / moderador / supervisor / apresentador: mudar o status para **Realizada** passa a ser direto, sem abrir o modal do closer.
- O botão **"Registrar / atualizar venda"** continua sendo o único passo necessário: preenche produto, valor coletado e origem da venda, marca a agenda como realizada automaticamente e já alimenta as métricas (Vendas registradas, coletado, conversão, Performance por Closer).
- Para closer o comportamento não muda: ao marcar Realizada, ele continua obrigado a preencher faturamento do lead + Vendeu? (declaração informativa).

## Detalhes técnicos

- `src/pages/DashboardPage.tsx` (`handleStatusChange`, ~linha 761): o desvio `if (newStatus === "realizada") setVendaDialogAg(...)` passa a valer apenas quando o usuário **não** é gestor/moderador/supervisor/apresentador (usa `isGestor`, `isModerador`, `isSupervisor`, `isApresentador` do `AuthContext`). Para esses papéis o update de status segue o fluxo normal.
- Nenhuma mudança em `GestorVendaDialog.tsx` (já grava `vendeu: true`, `valor`, `produto`, `venda_origem`, `closed_at` e força `status = realizada` em um único submit), nem em banco/métricas.
