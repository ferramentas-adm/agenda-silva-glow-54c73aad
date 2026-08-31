# Filtro de motivo de não comparecimento: só a lista oficial

## O que muda

O dropdown "Motivo de não comparecimento" na Lista de Reuniões passa a mostrar somente os motivos cadastrados em Administração > + Listas > Motivos de não comparecimento (os mesmos 5 do diálogo "Não compareceu"):

- Alterou horário para o mesmo dia
- Cancelou por desistência
- Cancelou por imprevisto pessoal
- No-show
- Sem closer disponível

Além de "Todos os motivos" e "Sem motivo informado".

Textos livres de justificativa gravados em reuniões antigas deixam de poluir o filtro (continuam visíveis na coluna da tabela, apenas não viram opção de filtro).

## Detalhes técnicos

- `src/pages/ReunioesListPage.tsx`: no memo `noShowReasonOptions`, remover a união com os valores presentes em `agendamentos` e usar apenas `noShowReasonsCadastrados` (fallback `DEFAULT_NO_SHOW_REASONS`), ordenados em pt-BR.
- Nenhuma mudança de banco, de coluna da tabela ou de exportação CSV.
