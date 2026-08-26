# Pop-up de novo agendamento não aparece após "Não compareceu" na trava

## O que está acontecendo

Na trava de reuniões vencidas (`OverdueMeetingsLockOverlay`), o diálogo de "Não compareceu" e o pop-up de novo agendamento estão renderizados **dentro** do bloco da trava. O componente tem um `if (count === 0) return null` no início.

Sequência do clique: grava `no_show` → invalida/refetch as queries → a reunião sai da lista de pendências → `count` vira 0 → a trava inteira (incluindo o pop-up de novo agendamento que acabou de ser marcado para abrir) é desmontada. Resultado: o pop-up nunca aparece.

Na tela de Detalhes da Reunião isso não acontece porque o pop-up vive em um componente que não desmonta.

## Como corrigir

Tornar o pop-up de novo agendamento independente da existência da trava:

1. Mover os dois diálogos (`NaoCompareceuDialog` e `NovoAgendamentoPromptDialog`) para **antes** do `return null` de `count === 0`, dentro de um fragmento sempre renderizado — a trava (o painel escuro com a lista) continua condicionada a `count > 0`.
2. Definir o lead do novo agendamento **antes** de invalidar/refetch as queries, para não depender da ordem de atualização do cache.
3. Manter o restante do comportamento igual: mesmo motivo obrigatório, mesma gravação de `no_show` + `cancellation_reason`, mesmas invalidações e refetch do dia.

## Detalhes técnicos

- Arquivo: `src/components/OverdueMeetingsLockOverlay.tsx`
  - Reestruturar o JSX em `<> {count > 0 && !hidden && (<div …painel da trava…/>)} <NaoCompareceuDialog …/> <NovoAgendamentoPromptDialog …/> </>`, substituindo os `return null` antecipados por um flag de visibilidade do painel (os hooks permanecem no topo, sem mudança de ordem).
  - No `onConfirm` do `NaoCompareceuDialog`: chamar `setNovoAgendamentoLead(...)` e `setNoShowFor(null)` antes de `handleDirect`/invalidações, ou capturar o alvo e setar o lead imediatamente após o update bem-sucedido, antes do `invalidateAll()`.
- Sem mudanças de banco, RLS ou payload para o CRM.
