# Liberar slots de horário (Bloqueio em massa — gestor)

Replicar na tela "Bloqueio em massa" o recurso já validado na outra operação (prints anexos): o gestor consegue liberar um horário bloqueado — pelo closer ou por um bloqueio em massa — para caber uma reunião, com histórico e desfazer.

## Como funcionaria

Nova aba no topo, ao lado do formulário atual:

```text
[ Bloquear agenda ]   [ Liberar horário ]
```

### Painel "Liberar horário"

1. Gestor escolhe a **data** (padrão: hoje) e, opcionalmente, filtra por closers na lista da esquerda.
2. Lista todos os bloqueios daquela data, ordenados por horário, no mesmo formato dos prints:
   nome do closer · motivo · selo "Pontual" ou "Recorrente · toda Segunda", e abaixo a faixa `13:00–14:00`.
3. Ações por linha:
   - **Bloqueio pontual** → botão **Liberar** (remove o bloqueio daquele dia).
   - **Bloqueio recorrente** → **Liberar só neste dia** (abre exceção, mantendo a recorrência nas outras semanas) e **Remover recorrência** (apaga a regra inteira).
4. Ação em lote no rodapé: liberar uma faixa de horário (ex.: 13:00–14:00) para todos os closers selecionados de uma vez.
5. Quando a faixa liberada é menor que o bloqueio, o bloqueio é encurtado ou dividido em dois (antes e depois) — o resto do bloqueio continua valendo.

### Liberações recentes

Cartão abaixo, como no print: closer · data, faixa liberada e motivo original ("13:00–14:00 · Comunicado — fechamento de mês"), com botão **Desfazer** por linha, que restaura o bloqueio original.

### Efeito imediato

Depois de liberar, o horário aparece disponível na tela "Agendar", no seletor de horários e no "Calendário" sem precisar recarregar. Toda liberação e todo desfazer geram log de auditoria (quem fez, closer, data, faixa, motivo).

## Detalhes técnicos

- `src/pages/BloqueioMassaPage.tsx`: novo estado de aba, consulta de bloqueios efetivos por data (pontuais + recorrentes do dia da semana), helper puro `subtractRange(block, from, to)` retornando `delete | update | split`, cartão de liberações recentes.
- Banco (uma migração):
  - `closer_block_releases` — histórico das liberações com `closer_id`, `block_date`, `start_time`, `end_time`, motivo original, snapshot do bloqueio removido (para o Desfazer), `released_by`, `undone_at`. RLS: gestor/moderador gerencia; leitura para autenticados; GRANTs para `authenticated` e `service_role`.
  - `closer_block_exceptions` — exceções pontuais de bloqueios recorrentes (`block_id`, `exception_date`, `start_time`, `end_time`), com RLS e GRANTs equivalentes, viabilizando o "Liberar só neste dia".
- Leitura de disponibilidade: helper compartilhado que subtrai as exceções dos bloqueios recorrentes, aplicado nos 5 pontos que hoje leem `closer_blocks` — `src/hooks/useSlotCounts.ts`, `src/components/agendar/TimeSlotPicker.tsx`, `src/components/agendar/CloserSelector.tsx`, `src/pages/AgendarPage.tsx` e `src/pages/DashboardPage.tsx`. Bloqueios pontuais liberados são resolvidos direto em `closer_blocks` (delete/update/split), sem exceção.
- Invalidação de `closer-blocks`, `closer-blocks-day`, `closer-blocks-slots`, `closers-availability` e das novas queries após cada ação.
- Guardas: faixa válida (fim > início), data não retroativa, ação restrita a gestor (a página já é gestor-only), log via `src/services/auditLog.ts`.
- Somente tokens do design system, mantendo o visual escuro atual.
