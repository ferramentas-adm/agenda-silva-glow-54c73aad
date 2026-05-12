## Restringir botões do overlay por papel

### Regra por reunião

Cada card no `OverdueMeetingsLockOverlay` mostra botões conforme a relação do **usuário logado** com **aquela reunião**:

- **É o SDR criador** (`m.created_by === user.id`):
  - Mostra **No-show**, **Cancelada**, **Reagendar**.
- **É o Closer da reunião** (`m.closer_id === myCloserId`):
  - Mostra apenas **Realizada**.

Se o usuário for ambos na mesma reunião, vê a união dos botões — sem tratamento especial.

### Implementação

Em `src/components/OverdueMeetingsLockOverlay.tsx`:

- Pegar `user` do `useAuth` e `myCloserId` (expor pelo `useOverdueMeetings`).
- Para cada `m`, calcular `isSdrOfThis` e `isCloserOfThis`.
- Renderizar cada botão condicionalmente:
  - **Realizada** → só se `isCloserOfThis`
  - **No-show / Cancelada / Reagendar** → só se `isSdrOfThis`

### Hook

`useOverdueMeetings` passa a expor `myCloserId` (já é buscado internamente).

### Sem mudança na regra de trava

A trava continua aparecendo para qualquer envolvido. Muda só o conjunto de botões disponíveis.

### Fora de escopo

- Sem mudanças em `PendingMeetingsBanner`, RLS, schema ou outros fluxos.