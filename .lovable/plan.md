# Closer só registra a call; gestor lança a venda

## Como fica o fluxo

**Closer — modal "Resultado da Reunião"**
- Fica apenas: `Faturamento do lead *` e `Vendeu? Sim / Não`.
- Saem do modal: produto, valor coletado, valor total do projeto, origem da venda, motivo/explicação de não fechamento, follow-up, observações e recebimento de sinal.
- Ao confirmar, a reunião vira **realizada** e a resposta do closer é gravada apenas como declaração — **não entra em nenhuma métrica de venda** (Vendas registradas, coletado, conversão, Performance por Closer).

**Gestor / Moderador / Supervisor / Apresentador**
- Clicando na agenda (reunião realizada), o botão existente **"Registrar / atualizar venda"** abre um modal novo e enxuto:
  - `Produto *`
  - `Valor coletado (R$) *`
  - `Origem da venda *` — Venda na 1ª call | Venda de follow-up
- Sem valor total do projeto e sem descrição do cliente.
- Se já existe venda lançada, o modal abre preenchido para edição e oferece **Remover venda** (a reunião volta a "realizada sem venda", mantendo a declaração do closer).
- Somente esse lançamento alimenta as métricas de venda.
- **Independente do closer**: o gestor pode lançar a venda em qualquer reunião realizada, mesmo que o closer tenha marcado "Não" ou não tenha preenchido nada.

**Indicação visual**: no detalhe da agenda, se o closer marcou "Sim" e ainda não há venda lançada, aparece um aviso informativo "Closer indicou venda" — apenas sinalização, não bloqueia nem exige nada.

## Detalhes técnicos

- Migração: nova coluna `vendas.vendeu_closer boolean` (nullable) = declaração do closer. `vendas.vendeu` continua sendo a fonte única das métricas e passa a ser gravado **apenas** pelo modal do gestor.
- `src/components/VendaDialog.tsx`: reduzido a `leadRevenue` + `vendeu`. Grava upsert com `vendeu: false`, `vendeu_closer`, `lead_revenue`, e atualiza `agendamentos.status = 'realizada'`. Removidas as chamadas de criação de 2ª reunião, pagamento previsto e limpeza de follow-ups; o webhook DataCrazy passa a ser disparado com outcome de call realizada (sem venda).
- Novo `src/components/dashboard/GestorVendaDialog.tsx`: campos produto (lista `APP_SETTING_KEYS.produtos` com fallback texto), valor coletado (máscara BRL existente) e `venda_origem`. Upsert em `vendas` por `agendamento_id` com `vendeu: true`, `valor`, `produto`, `venda_origem`, `closed_at` = hoje (BRT), preservando `lead_revenue`/`vendeu_closer`. Remover venda = update `vendeu: false, valor: null, produto: null, venda_origem: null, closed_at: null`. Ambos com `logAudit` e envio ao DataCrazy via `sendVendaToDataCrazy`.
- `src/pages/DashboardPage.tsx`: o botão "Registrar / atualizar venda" passa a abrir o `GestorVendaDialog`; `VendaDialog` continua no fluxo do closer (inclusive `src/pages/VendaPage.tsx`).
- Métricas (`VendasTab`, `dashboard_conversao_period`, `silva-vendas`) não mudam — continuam lendo `vendeu`/`venda_origem`, então já refletem o novo fluxo automaticamente.
