# Motivo de não comparecimento na Lista de Reuniões

## O que muda

1. **Nova coluna "Não compareceu — motivo"** na tabela da Lista de Reuniões, entre "Motivo" (motivo da reunião) e "Canal".
   - Mostra o motivo registrado no momento em que a reunião foi marcada como "Não compareceu".
   - Reuniões sem esse registro exibem "—".
   - Coluna ordenável, como as demais.

2. **Novo filtro no topo** (ao lado do filtro de Canal): "Motivo de não comparecimento".
   - Opções: "Todos os motivos", cada motivo cadastrado em Administração > + Listas > Motivos de não comparecimento, e "Sem motivo informado" (registros de não comparecimento sem motivo).
   - Entra na contagem de filtros ativos e no botão de limpar filtros; volta para a página 1 ao mudar.

3. **Exportação CSV** ganha a mesma coluna, para que o arquivo baixado reflita a tabela.

## Detalhes técnicos

- `src/pages/ReunioesListPage.tsx`:
  - incluir `cancellation_reason` no `select` da query de `agendamentos` (campo já existe na tabela e é gravado pelo diálogo de não comparecimento);
  - novo estado `filterNoShowReason` aplicado no `useMemo` de `filtered` (valor especial para "sem motivo" = registros com `status` de não comparecimento e `cancellation_reason` vazio);
  - nova `SortKey` `cancellation_reason` na lista de colunas e no comparador;
  - opções do filtro via `useAppSettingList(APP_SETTING_KEYS.no_show_reasons, DEFAULT_NO_SHOW_REASONS)`, unindo os valores já existentes nos registros carregados para não perder motivos legados;
  - ajustar `colSpan`/número de skeletons da tabela e o array de `headers` do `exportCSV`.
- Nenhuma alteração de banco.
