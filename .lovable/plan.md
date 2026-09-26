# Bloqueios "silenciosos" na agenda dos closers

## O que a investigação encontrou

- Nenhuma automação do sistema cria bloqueios. O único lugar que grava bloqueios é a tela **Bloqueio em massa**, acionada por uma pessoa logada (gestor/moderador).
- Hoje (25/09) às 19:13 (Brasília), um único envio do Bloqueio em massa criou, ao mesmo tempo, **bloqueios recorrentes das 09:00 às 23:59 para ~25 closers** (Igor Occon, Leandro Borges, Bruno Casari, Pedro Brito, André Sechi, Kelvyn, Vitor Lima, Maria Fiusa etc.), motivo "Compromisso pessoal". Por ser recorrente, isso fecha o dia inteiro toda semana nesse dia.
- Quem estava operando bloqueios nesse minuto era Carlos Medeiros (ele apagou um bloqueio 8 segundos depois e editou vários em seguida). Mas **não dá para provar** quem criou, porque:
  1. O Bloqueio em massa **não grava auditoria** ao criar (edição e exclusão individuais gravam).
  2. Ao criar, ele **apaga automaticamente** bloqueios existentes que ficam dentro do novo horário — também sem registrar.
  3. A tabela de bloqueios não guarda quem criou.
- Resultado: para quem olha o calendário, parece que "o sistema bloqueou sozinho".

## O que será feito

1. **Conter agora**: listar os bloqueios recorrentes 09:00–23:59 criados às 19:13 e, após sua confirmação, removê-los (com registro de auditoria e possibilidade de restaurar), para reabrir as agendas.
2. **Rastro obrigatório**: todo bloqueio passa a guardar quem criou e quando; o banco preenche isso sozinho.
3. **Auditoria completa no banco**: toda criação, edição e exclusão de bloqueio fica registrada automaticamente (quem, closer, data/dias, horário, motivo), independente de qual tela fez.
4. **Fim da substituição silenciosa**: o Bloqueio em massa não apaga mais bloqueios existentes sem avisar; mostra antes quais serão substituídos e exige confirmação.
5. **Confirmação para bloqueios pesados**: antes de salvar, um resumo ("25 closers, toda sexta, 09:00–23:59, recorrente") com alerta extra quando for recorrente acima de 6h ou para mais de 5 closers.
6. **Visibilidade**: na lista de bloqueios recentes e no detalhe do bloqueio no calendário, mostrar "Criado por X em DD/MM HH:mm".

## Detalhes técnicos

- Migração: `closer_blocks.created_by uuid default auth.uid()`; trigger `AFTER INSERT/UPDATE/DELETE` inserindo em `audit_logs` (`create_closer_block` / `edit_closer_block` / `delete_closer_block`, com nome do closer e do autor), removendo os `logAudit` duplicados do front.
- `src/pages/BloqueioMassaPage.tsx`: diálogo de confirmação com resumo + lista de `containedIds` a substituir; sem exclusão sem confirmação.
- `CloserBlockDetailsDialog.tsx` e lista de recentes: exibir autor via `get_public_profiles`.
- Limpeza dos bloqueios de 25/09 22:13:03 UTC via SQL após aprovação, com snapshot em `audit_logs`.
