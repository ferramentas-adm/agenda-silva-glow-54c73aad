# Contagem de reuniões por Closer no seletor de "Aguardando atribuição"

## Sobre o limite

O limite hoje é **2 reuniões por Closer no mesmo horário** (mesma data + mesma hora), fixo no código e aplicado só ao clicar em "Atribuir". Ele continua sendo 2 por padrão, mas passa a ser configurável na tela Administração.

## O que muda no seletor

Cada nome no dropdown "Selecionar Closer" passa a mostrar a ocupação naquele horário exato pedido pelo SDR:

```text
Geraldo · 0/2
Arthur Machado · 1/2
Igor Occon · 2/2 cheio         (desabilitado)
Higor Bessa · agenda bloqueada (desabilitado)
```

Ordenação da lista, de cima para baixo:
1. Closers disponíveis primeiro (bloqueados e cheios vão para o fim).
2. Menor número de reuniões primeiro (0 → 1 → 2).
3. Empate: ordem alfabética crescente.

Closers que já atingiram o limite ficam desabilitados no seletor, evitando a tentativa frustrada.

## Nova configuração em Administração

Um novo cartão "Limite de reuniões por Closer no mesmo horário", ao lado do já existente "Limite de agendas por horário":
- Campo numérico (mínimo 1), padrão 2, com botão Salvar.
- Texto explicativo: define quantas reuniões um mesmo Closer pode ter no mesmo dia e horário; usado na validação da atribuição e no contador `x/limite` da tela "Aguardando atribuição".
- Alteração registrada no histórico de auditoria, como as outras configurações.

## Detalhes técnicos

- Novo hook `src/hooks/useCloserSlotLimit.ts`, espelhando `useSlotLimit`: chave `closer_slot_limit` na tabela `app_settings`, default 2, leitura + salvamento com `logAudit("update_settings", ...)` e toast. Sem migração de banco — `app_settings` já existe.
- `src/pages/AdminPage.tsx`: novo componente `CloserSlotLimitSetting` no mesmo padrão visual de `SlotLimitSetting`, renderizado junto dele.
- `src/pages/AguardandoAtribuicaoPage.tsx`:
  - Nova query que busca, para as datas presentes na lista de pendentes, os `agendamentos` com `closer_id` não nulo, `deleted_at is null` e `status <> 'cancelada'` (`closer_id, scheduled_date, scheduled_time`) — uma query cobre todos os cards.
  - Mapa `closer_id|data|hora → contagem` e helper `closerLoad(closerId, date, time)`.
  - Consumir `useCloserSlotLimit()` no rótulo `x/limite`, no `disabled` do `SelectItem` e substituindo o literal `2` na validação do `handleAssign`.
  - Lista de closers em `useMemo` por card, ordenada por (bloqueado/cheio, contagem, nome).
  - Invalidar a nova query após atribuir, junto das invalidações existentes.
