Gerar um PDF (artefato único, fora do app) com as vendas do mês atual (junho/2026), contendo por linha:

- Data da venda (closed_at)
- Closer
- Lead
- Produto vendido
- Valor coletado
- Resumo informado pelo Closer

Passos:
1. Consultar `vendas` (vendeu = true, closed_at no mês atual, agendamento não deletado) juntando `agendamentos` e `closers`.
2. Gerar PDF em `/mnt/documents/vendas-junho-2026.pdf` com cabeçalho, tabela e total coletado no rodapé.
3. Entregar via `<presentation-artifact>`.

Confirma que quero usar **mês atual (junho/2026) por `closed_at`**? Se preferir outro período (ex.: mês anterior, ou por data da reunião), me diga antes de gerar.