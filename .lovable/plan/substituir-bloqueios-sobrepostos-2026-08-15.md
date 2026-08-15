# Substituir bloqueios sobrepostos

Hoje, ao criar um bloqueio que engloba outro já existente (ex. "Dia inteiro" sobre um 10h–20h), os dois registros coexistem: o dia fica bloqueado, mas sobram registros duplicados e remover o novo não libera as horas antigas.

## Como vai funcionar

- Ao salvar bloqueios no "Bloqueio em massa", o sistema remove automaticamente os bloqueios existentes dos closers selecionados que ficarem totalmente contidos nos novos intervalos.
- Modo Pontual: compara apenas os bloqueios da data escolhida (mais os recorrentes daquele dia da semana).
- Modo Recorrente: compara os bloqueios recorrentes dos dias da semana escolhidos.
- Bloqueios que apenas encostam ou se sobrepõem parcialmente (ex. 08h–12h ao criar 09h–11h) são mantidos — só o que está inteiramente dentro do novo intervalo é substituído.
- O toast de sucesso informa quantos bloqueios foram criados e quantos foram substituídos.
- A lista "Bloqueios recentes" é atualizada na hora, sem duplicidades.

## Detalhe técnico

- Alteração apenas em `src/pages/BloqueioMassaPage.tsx`, dentro de `handleSubmit`: antes do insert, buscar em `closer_blocks` os registros dos closers selecionados no escopo (data ou weekdays), filtrar em JS os que satisfazem `start_time >= novo.start && end_time <= novo.end`, e deletar por `id` via `.in("id", ids)`.
- A exclusão acontece antes do insert; se o insert falhar, exibimos o erro normalmente (sem rollback automático, mesma semântica atual).
- Sem mudanças de banco, permissões ou RLS — a página já é restrita a Gestor e a política de delete de `closer_blocks` já é usada pelo botão de remover.
