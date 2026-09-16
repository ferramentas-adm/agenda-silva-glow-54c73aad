# Remover "Compromissos" do acesso dos closers

Closers deixam de bloquear ou liberar a própria agenda. Somente gestores e moderadores fazem isso, pelo módulo "Bloqueio em massa".

## O que muda

- O item "Compromissos" sai do menu lateral e do menu do celular — para todos os papéis.
- O closer não consegue mais criar nem apagar bloqueios da própria agenda, nem pela tela nem por qualquer outro caminho: a permissão no banco passa a exigir gestor/moderador.
- Os bloqueios já existentes continuam valendo, inclusive os que os closers criaram. Nada é apagado.
- O closer continua vendo os bloqueios no calendário (só não pode alterar).
- "Bloqueio em massa" (criar, remover, liberar horário) continua igual, disponível para gestor.

## Detalhes técnicos

- `src/components/AppLayout.tsx`: remover o botão "Compromissos" (desktop e mobile), o estado `blocksOpen`, o render de `CloserBlockDialog` e o import; remover `closerRecord`/`useMyCloserId` se ficar sem uso.
- Excluir `src/components/CloserBlockDialog.tsx` (fica sem referência).
- Migração nova em `drizzle/migrations/`: recriar as políticas de `closer_blocks` para `INSERT` e `DELETE` usando apenas `is_manager()` (hoje aceitam o closer dono via `auth.email()`). `SELECT` segue aberto a autenticados e `UPDATE` já é só de gestor.
- Sem alteração em disponibilidade, agendamento, métricas ou integrações externas.
