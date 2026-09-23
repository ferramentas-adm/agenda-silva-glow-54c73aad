# Produto de interesse obrigatório no agendamento

## Por que não aparece hoje
A lista de Produtos do Admin só é usada no lançamento de venda (venda avulsa, venda pela reunião e follow-up). A tela Agendar não tem campo de produto, e a reunião não guarda produto nenhum.

## O que muda
1. **Tela Agendar** — novo campo obrigatório "Produto sugerido pelo SDR", com a lista de Produtos do Admin. Sem escolher, o botão de agendar fica bloqueado. É só uma indicação da qualificação, não define o que será vendido.
2. **Detalhes da reunião** — o produto sugerido aparece para o closer e para o SDR, identificado como sugestão.
3. **Lançamento da venda** — o produto sugerido vem pré-selecionado apenas como ponto de partida; o closer ou o gestor escolhe livremente qualquer outro produto, sem justificativa. O produto vendido é o que vale para vendas e métricas; a sugestão do SDR fica guardada separada e nunca é sobrescrita.
4. **Auditoria** — o produto entra no registro de criação do agendamento.
5. **Ativar/desativar produto em "+ Listas"** — cada produto ganha um interruptor Ativo/Inativo. Produto inativo fica na lista com o selo "Inativo", some das opções de escolha (Agendar, lançamento de venda, venda avulsa, follow-up) e continua aparecendo normalmente no histórico, nas vendas já lançadas, nos filtros e nos relatórios. Ao editar uma venda antiga com produto inativo, ele continua selecionado. Ativar e desativar fica registrado nos logs.

## O que NÃO muda
- Reuniões antigas ficam sem produto (nada retroativo).
- Na rota da IA SDR (/silva-agendar), o campo `produto` é aceito como opcional para não quebrar a automação; se vier fora da lista, a reunião é criada sem produto.
- Métricas, lembretes e mensagens ao lead não mudam.

## Detalhes técnicos
- Migração: `agendamentos.produto_interesse text null`.
- `src/pages/AgendarPage.tsx`: `useAppSettingList(APP_SETTING_KEYS.produtos)` + `Select` obrigatório (se a lista estiver vazia, não bloqueia); grava `produto_interesse` no insert.
- `src/pages/LeadDetalhesPage.tsx`: exibir o campo.
- `GestorVendaDialog.tsx`: pré-preencher `produto` com `produto_interesse` quando não houver venda.
- `silva-agendar`: aceitar `produto` opcional, validar contra a lista de produtos ativos em `app_settings`.
- Inativos: nova chave `produtos_inativos` em `app_settings` (JSON de nomes), sem migração. `DynamicListManager` ganha `Switch` por item quando `settingKey === produtos`. Seletores de escolha usam só ativos (+ o valor atual, se inativo); filtros e relatórios usam a lista completa.
