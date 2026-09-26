# Bloqueios e liberações sempre nos logs de auditoria

## O que a investigação encontrou

- Nenhuma automação do sistema cria bloqueios. Eles só são gravados pela tela **Bloqueio em massa**, por uma pessoa logada (gestor/moderador).
- Em 25/09 às 19:13 (Brasília), um único envio do Bloqueio em massa criou bloqueios recorrentes das 09:00 às 23:59 para cerca de 25 closers. Carlos Medeiros estava operando bloqueios nesse minuto, mas não dá para provar a autoria porque:
  1. A criação pelo Bloqueio em massa **não entra nos logs de auditoria**.
  2. Ao criar, a tela **apaga sozinha** bloqueios que ficam dentro do novo horário, também sem registro.
  3. O bloqueio não guarda quem o criou.
- Por isso parece que "o sistema bloqueou sozinho". Nenhum bloqueio existente será desfeito.

## O que será feito

1. **Todo bloqueio registrado nos logs**: criar, editar ou remover um bloqueio (em massa, no calendário ou em qualquer outra tela) passa a gerar automaticamente um registro com quem fez, quando, closer, data ou dia da semana, horário e motivo.
2. **Toda liberação registrada nos logs**: "Liberar horário" (só neste dia ou a recorrência inteira) e "Desfazer liberação" também passam a aparecer nos logs, com o horário liberado e o bloqueio original.
3. **Substituições visíveis**: quando o Bloqueio em massa trocar bloqueios antigos pelo novo, cada bloqueio substituído aparece nos logs como "Removido por substituição", com o autor.
4. **Autor salvo no próprio bloqueio**: cada bloqueio novo guarda quem o criou, mostrado como "Criado por X em DD/MM HH:mm" no detalhe do bloqueio e na lista de bloqueios recentes.
5. **Filtro na tela de Logs**: novos rótulos ("Criou bloqueio", "Removeu bloqueio", "Liberou horário", "Desfez liberação") e filtro por esse tipo de ação.

Os bloqueios criados antes desta mudança continuam sem autor conhecido; o registro vale daqui para frente.

## Detalhes técnicos

- Migração: `closer_blocks.created_by uuid default auth.uid()`; triggers `AFTER INSERT/UPDATE/DELETE` em `closer_blocks` e `AFTER INSERT/UPDATE` em `closer_block_exceptions` e `closer_block_releases`, gravando em `audit_logs` (`create_closer_block`, `edit_closer_block`, `delete_closer_block`, `release_closer_block`, `undo_release_closer_block`) com autor vindo de `profiles`. Quando `auth.uid()` for nulo, registrar como "Sistema/API".
- Remover os `logAudit` de bloqueio duplicados no front (`CloserBlockDetailsDialog.tsx`, `LiberarHorarioPanel.tsx`) para não gerar registros em dobro; em `BloqueioMassaPage.tsx`, marcar as exclusões por substituição (via `set_config` local ou coluna de motivo) para aparecerem como substituição.
- `AuditLogsPage.tsx`: novos rótulos e filtro. `silva-bloqueios` passa a ler `created_by` diretamente.
