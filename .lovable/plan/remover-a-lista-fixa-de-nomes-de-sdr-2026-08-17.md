# Remover a lista fixa de nomes de SDR

## O que é essa lista fixa

Em `src/lib/sdrOverrides.ts` existe `SDR_OVERRIDE_NAMES`, hoje com um único nome: "Lucas Emanuel". Ela foi criada antes de existir o botão "Atua como SDR" no Admin, como forma manual de incluir alguém nas listas/rankings de SDR comparando o `full_name` do perfil (sem acentos, case-insensitive).

Hoje ela é redundante: verifiquei no banco e o Lucas Emanuel (Supervisor) já está com a marcação "Atua como SDR" ligada. Os outros marcados também estão cobertos pela marcação (Ellen Morales, Henrique Sousa — supervisores; e alguns SDRs).

## Confirmação da sua leitura

Sim, confere. A regra passa a ser somente:
- função `SDR`; ou
- qualquer outra função (Moderador, Supervisor, Closer, Apresentador) com "Atua como SDR" ligado;
- e nunca `Gestor`, mesmo com a marcação ligada (regra já implementada).

## Mudanças

1. `src/lib/sdrOverrides.ts`: apagar `SDR_OVERRIDE_NAMES`, `isSdrOverrideName` e a normalização de nomes. `countsAsSdr` fica: `false` se `gestor`; `true` se `sdr`; senão `isOverride === true`.
2. Remover os usos de `isSdrOverrideName` em `src/pages/DashboardPage.tsx` (import e a checagem na linha ~348, que passa a olhar só `is_sdr_override`) e o import em `src/pages/DashboardComercialPage.tsx`.
3. `src/pages/ReunioesListPage.tsx` e `src/pages/AgendarPage.tsx` já usam apenas `countsAsSdr` — nenhuma mudança necessária.

## Resultado

Nada muda no comportamento atual (quem estava na lista já tem a marcação), e passa a existir uma única fonte de verdade: função + botão "Atua como SDR" no Admin. Novos casos são resolvidos pelo Admin, sem mexer em código.
