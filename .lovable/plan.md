# Contagem de reuniões por Closer no seletor de "Aguardando atribuição"

## Sobre o limite atual

O limite hoje é **2 reuniões por Closer no mesmo horário** (mesma data + mesma hora). Ele é aplicado no momento em que você clica em "Atribuir": se o Closer já tiver 2 reuniões ativas naquele slot, a atribuição é bloqueada com a mensagem "Esse Closer já tem 2 reuniões nesse horário. Escolha outro." Reuniões canceladas e excluídas não contam.

Depois de ver os números na tela, se quiser mudar esse limite (para 1, 3, ou torná-lo configurável em Administração), é só pedir.

## O que muda no seletor

Cada nome no dropdown "Selecionar Closer" passa a mostrar a ocupação naquele horário exato pedido pelo SDR:

```text
Geraldo · 0/2
Arthur Machado · 1/2
Igor Occon · 2/2 cheio        (desabilitado)
Higor Bessa · agenda bloqueada (desabilitado)
```

Ordenação da lista, de cima para baixo:
1. Closers disponíveis primeiro (bloqueados e cheios vão para o fim).
2. Menor número de reuniões primeiro (0 → 1 → 2).
3. Empate: ordem alfabética crescente.

Closers que já atingiram o limite de 2 ficam desabilitados no seletor (hoje só recebem o erro depois de clicar em "Atribuir"), evitando a tentativa frustrada.

## Detalhes técnicos

- Em `src/pages/AguardandoAtribuicaoPage.tsx`, adicionar uma query que busca, para as datas presentes na lista de pendentes, todos os `agendamentos` com `closer_id` não nulo, `deleted_at is null` e `status <> 'cancelada'`, selecionando `closer_id, scheduled_date, scheduled_time`. A mesma query cobre todos os cards da página.
- Construir um mapa `closer_id|data|hora → contagem` e um helper `closerLoad(closerId, date, time)`.
- Extrair a constante `SLOT_LIMIT_PER_CLOSER = 2` (hoje literal na validação do `handleAssign`) e usá-la tanto no rótulo `x/2` quanto no `disabled` do `SelectItem` e na validação existente.
- A lista renderizada passa a ser um `useMemo` por card, ordenando por (bloqueado/cheio, contagem, nome).
- Invalidar essa nova query após atribuir, junto das invalidações já existentes, para os contadores atualizarem na hora.
