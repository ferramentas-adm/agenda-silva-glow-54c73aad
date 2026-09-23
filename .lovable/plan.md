# Produto de interesse obrigatório no agendamento

## Por que não aparece hoje
A lista de Produtos do Admin só é usada no lançamento de venda (venda avulsa, venda pela reunião e follow-up). A tela Agendar não tem campo de produto, e a reunião não guarda produto nenhum.

## O que muda
1. **Tela Agendar** — novo campo obrigatório "Produto de interesse", com a lista de Produtos do Admin. Sem escolher, o botão de agendar fica bloqueado.
2. **Detalhes da reunião** — o produto aparece para o closer e para o SDR.
3. **Lançamento da venda** — ao lançar a venda da reunião, o produto já vem preenchido com o produto de interesse (pode trocar).
4. **Auditoria** — o produto entra no registro de criação do agendamento.

## O que NÃO muda
- Reuniões antigas ficam sem produto (nada retroativo).
- Na rota da IA SDR (/silva-agendar), o campo `produto` é aceito como opcional para não quebrar a automação; se vier fora da lista, a reunião é criada sem produto.
- Métricas, lembretes e mensagens ao lead não mudam.

## Detalhes técnicos
- Migração: `agendamentos.produto_interesse text null`.
- `src/pages/AgendarPage.tsx`: `useAppSettingList(APP_SETTING_KEYS.produtos)` + `Select` obrigatório (se a lista estiver vazia, não bloqueia); grava `produto_interesse` no insert.
- `src/pages/LeadDetalhesPage.tsx`: exibir o campo.
- `GestorVendaDialog.tsx`: pré-preencher `produto` com `produto_interesse` quando não houver venda.
- `silva-agendar`: aceitar `produto` opcional, validar contra a lista em `app_settings`.
