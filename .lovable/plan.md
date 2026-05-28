## Objetivo

Quando gestor/moderador agenda, nunca pode ficar registrado como SDR. Ele precisa **obrigatoriamente**:
- escolher um SDR (vai para `sdr_responsavel_id`), **ou**
- marcar a reunião como **2ª reunião** (Segunda Reunião), e nesse caso escolher um Closer responsável.

Assim toda agenda tem origem clara: ou SDR identificado, ou 2ª reunião.

## Mudanças em `src/pages/AgendarPage.tsx`

1. **Filtrar o seletor de responsável** (hoje lista qualquer usuário ativo): passar a buscar só perfis com `role = 'sdr'` via `user_roles`, e renomear o label para **"SDR responsável"**.

2. **Novo toggle "É 2ª reunião (Closer)"** visível só para gestor/moderador (`isAdmin`).
   - Quando **ligado**:
     - Esconde o seletor de SDR e zera `selectedSdrId`.
     - Fixa `channel_type = "Segunda Reunião"` (igual ao fluxo de closer) e desabilita o select de canal.
     - `meeting_reason = 'segunda_reuniao'`.
     - Exige que um Closer responsável seja escolhido (já é o `closerId` do passo "closer", então naturalmente atendido).
   - Quando **desligado**:
     - Mostra o select de SDR como **obrigatório** (remover texto "opcional", adicionar `*`).
     - `meeting_reason = null`, canal segue regra atual.

3. **Validação no `handleSubmit`** para isAdmin:
   - Se toggle desligado e `!selectedSdrId` → `toast.error("Selecione o SDR responsável ou marque como 2ª reunião.")` e aborta.
   - Se toggle ligado → grava `sdr_responsavel_id = null`, `channel_type = "Segunda Reunião"`, `meeting_reason = "segunda_reuniao"`.

## Reflexo no Dashboard (`src/pages/DashboardPage.tsx`)

Com a regra acima, reuniões de gestor/moderador agora se classificam sozinhas:

- **Total SDRs / status counts SDR**: passar a considerar como "SDR" toda agenda em que `userRolesMap.get(created_by) === 'sdr'` **OU** `sdr_responsavel_id` está preenchido. Isso joga as agendas que o gestor/moderador subiu em nome de um SDR para o lado certo.
- **Total Closers (2ª reunião)**: além de `created_by` com role `closer`, contar também quando `meeting_reason === 'segunda_reuniao'` (cobre os casos em que gestor/moderador marca 2ª).

## Banco

Sem migração. Os campos já existem (`sdr_responsavel_id`, `meeting_reason`, `channel_type`).

## Fora de escopo

- Não mexer nas reuniões antigas já criadas por gestor/moderador sem SDR; ficam como estão (continuam fora das contagens) salvo a regra de `sdr_responsavel_id`/`meeting_reason` acima, que já vai puxar parte delas se tiverem esses campos preenchidos.
