# Liberar slots de horário (Bloqueio em massa — gestor)

Hoje a tela "Bloqueio em massa" só permite criar bloqueios e apagar um bloqueio inteiro (ícone de lixeira em "Bloqueios recentes"). Falta o caso do dia a dia: um horário está bloqueado (pelo closer ou por um bloqueio em massa) e o gestor precisa liberar só aquela janela para caber uma reunião.

## Como funcionaria

Nova aba no topo da tela, ao lado do formulário atual:

```text
[ Bloquear agenda ]   [ Liberar horário ]
```

### Fluxo "Liberar horário"

1. Gestor escolhe a **data** (padrão: hoje).
2. Escolhe os **closers** na mesma lista da esquerda (com busca, "selecionar todos").
3. O painel mostra a **grade de bloqueios daquela data** para os closers escolhidos, um cartão por bloqueio:
   nome do closer, motivo, faixa de horário, selo "Toda Terça" quando recorrente.
4. Em cada bloqueio, o gestor pode:
   - **Liberar tudo** — remove o bloqueio inteiro (comportamento atual da lixeira).
   - **Liberar uma faixa** — informa início/fim (ex.: liberar 14:00–15:00 dentro de um bloqueio 09:00–23:59).
5. Também há uma ação em lote no rodapé: **"Liberar 14:00–15:00 para os closers selecionados"**, que aplica a mesma liberação em todos os bloqueios que cruzam aquela faixa, nos closers marcados.
6. Confirmação com resumo ("3 bloqueios ajustados, 1 removido") e a agenda/seletor de horários já refletem a liberação na hora.

### O que acontece por trás em cada caso

| Situação | Resultado |
|---|---|
| Faixa liberada cobre todo o bloqueio | bloqueio é removido |
| Faixa no início ou no fim do bloqueio | horário do bloqueio é encurtado |
| Faixa no meio do bloqueio | bloqueio é dividido em dois (antes e depois da faixa) |
| Bloqueio recorrente | ver abaixo |

### Bloqueio recorrente

Para recorrentes (ex.: "toda terça 12:00–13:00") o gestor escolhe o alcance:

- **Em todas as terças** — encurta/divide/remove a regra recorrente (implementação direta, igual ao pontual).
- **Somente nesta data** — abre uma exceção pontual, mantendo a recorrência nas outras semanas. Isso exige um pequeno recurso novo no banco (tabela de exceções) e ajuste em todos os pontos que leem bloqueios; proponho fazer em uma segunda etapa, para a primeira já entrar rápido.

Sugestão: começar com "em todas as ocorrências" + liberação de bloqueios pontuais (cobre a maioria dos casos, inclusive bloqueios em massa), e depois liberar a exceção por data.

### Registro

Toda liberação gera log de auditoria (quem liberou, closer, data, faixa, motivo original), para o gestor conseguir rastrear depois.

## Detalhes técnicos

- Tudo dentro de `src/pages/BloqueioMassaPage.tsx`: novo estado `tab` ("bloquear" | "liberar"), consulta de bloqueios por data + closers selecionados, e um helper puro `subtractRange(block, from, to)` que devolve `delete | update | split`.
- A liberação é feita reescrevendo registros de `closer_blocks` (delete / update `start_time`,`end_time` / delete + 2 inserts). Nenhum consumidor precisa mudar — `useSlotCounts`, `TimeSlotPicker`, `CloserSelector`, `AgendarPage` e `DashboardPage` continuam lendo a tabela do mesmo jeito.
- Invalidação de `closer-blocks`, `closer-blocks-day`, `closer-blocks-slots` e `closers-availability` após cada operação.
- Guardas: faixa válida (fim > início), faixa precisa cruzar ao menos um bloqueio, data não retroativa, acesso restrito a gestor (a página já é gestor-only).
- Log via `src/services/auditLog.ts`.
- Etapa 2 (exceção por data em recorrentes): tabela `closer_block_exceptions` (block_id, exception_date, start_time, end_time) com RLS + GRANTs, e um helper compartilhado de "bloqueio efetivo" aplicado nos 5 pontos de leitura.
- Somente tokens do design system, mantendo o visual escuro atual.
