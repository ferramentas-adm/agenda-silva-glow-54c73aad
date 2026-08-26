# Briefing esmaecido e sem clique: corrigir empilhamento

## O que a verificação mostrou

O problema não é permissão. As permissões de briefing continuam as mesmas (SDR dono do agendamento, gestores e moderadores).

Nas correções de ontem, os diálogos foram elevados para ficar acima da trava de reuniões vencidas: o overlay de `Dialog`/`AlertDialog` foi para `z-[120]` e o conteúdo para `z-[130]`. O painel lateral de Briefing (`Sheet`) ficou como estava, em `z-50`.

Resultado: quando o Briefing é aberto junto com o modal "Detalhes do agendamento" (exatamente o caso do print), a camada escura do modal fica **por cima** do painel de Briefing. Ele aparece esmaecido e não recebe cliques — o texto, o lápis de editar e o botão "Adicionar Briefing" ficam inacessíveis.

## Como vai ficar

O painel de Briefing volta a ficar acima da camada escura dos modais: aparece com cor normal e volta a aceitar cliques (editar, remover, adicionar, marcar como lido) para quem já tinha permissão — SDR responsável pelo agendamento, gestores e moderadores.

Nenhuma mudança de permissão, de banco ou de regra de negócio.

## Detalhes técnicos

- `src/components/ui/sheet.tsx`: elevar `SheetOverlay` de `z-50` para `z-[140]` e o `sheetVariants` (conteúdo) para `z-[150]`, mantendo `Select`/dropdowns em `z-[200]` acima do painel.
