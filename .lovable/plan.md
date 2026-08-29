# Seleção manual de leads no envio em lote

Hoje a aba "Envio em lote" só permite enviar o período inteiro (ou a primeira venda como teste). Vamos adicionar busca e caixas de seleção para você escolher exatamente quais leads reenviar.

## O que muda na tela

- **Campo de busca** acima da lista: filtra por nome do lead, telefone, closer ou SDR (sem precisar recarregar a pré-visualização).
- **Caixa de seleção em cada linha** da tabela, mais uma caixa no cabeçalho para "selecionar todos" (respeitando o filtro de busca ativo).
- **Contador de selecionados** com valor somado: "12 selecionadas · R$ 34.000".
- **Botões de ação atualizados**:
  - "Enviar selecionadas (N)" — envia só o que está marcado; desabilitado quando nada está marcado.
  - "Enviar lote" continua enviando o período inteiro.
  - "Payload de teste" passa a usar a primeira venda selecionada, quando houver.
  - "Limpar seleção".
- **Após o envio**, as vendas que falharam permanecem selecionadas e as enviadas com sucesso são desmarcadas, para facilitar o reenvio.
- A barra de progresso e a lista de falhas continuam funcionando igual, agora medindo o conjunto selecionado.

## Detalhes técnicos

- Arquivo único alterado: `src/components/admin/CrmBulkVendasPanel.tsx`.
- Novo estado: `search` (string) e `selected` (`Set<string>` de `venda_id`); `filtered` derivado por `useMemo` a partir de `items` + `search` (comparação sem acento/case-insensitive, telefone comparado só por dígitos).
- `Checkbox` do shadcn nas linhas e no cabeçalho (estado indeterminado quando parcialmente marcado).
- `send(ids)` já aceita uma lista arbitrária de IDs, então não há mudança na edge function `crm-bulk-vendas` nem no backend; a limitação de 40 IDs por chamada e o fatiamento em blocos de 25 no frontend continuam válidos.
- Ao recarregar a pré-visualização, a seleção é limpa.
