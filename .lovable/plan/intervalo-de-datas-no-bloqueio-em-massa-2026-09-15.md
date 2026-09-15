# Intervalo de datas no Bloqueio em massa

Hoje a tela "Bloqueio em massa" só permite uma data única (Pontual) ou dias da semana (Recorrente). Adicionar um terceiro modo: **Período**, que bloqueia todos os dias entre uma data inicial e uma data final.

## Como vai funcionar

- A barra de modos passa a ter três opções: **Pontual | Período | Recorrente**.
- No modo Período, o calendário vira um seletor de intervalo: o gestor clica na data inicial e na data final (pode clicar duas vezes na mesma data para um dia só, igual ao Pontual).
- Datas passadas continuam bloqueadas; o intervalo precisa ter início e fim válidos, e o fim não pode ser antes do início.
- Ao confirmar, o sistema cria um bloqueio para cada dia do intervalo, para cada closer selecionado e para cada faixa de horário (incluindo o "Dia inteiro"). Ex.: 3 closers × 5 dias = 15 bloqueios.
- Para não explodir a lista por engano, o intervalo é limitado a **31 dias** — acima disso, o botão fica desabilitado com aviso.
- As regras atuais continuam valendo por dia: bloqueios antigos totalmente cobertos pelo novo intervalo são substituídos; o aviso de reuniões já agendadas dentro dos horários bloqueados passa a considerar todos os dias do período.
- O toast informa o total criado ("15 bloqueios criados!") e a lista "Bloqueios recentes" mostra cada dia como linha separada, como já acontece hoje — a remoção individual por dia continua pelo botão de excluir.
- Nada muda nos modos Pontual e Recorrente, nem na aba "Liberar horário".

## Detalhes técnicos

- Arquivo: `src/pages/BloqueioMassaPage.tsx` apenas.
- Novo valor `"periodo"` no estado `mode`; novo estado `dateRange: { from?: Date; to?: Date }`.
- Seletor: `Calendar mode="range"` (react-day-picker já usado no projeto) com `disabled` para datas passadas, dentro do mesmo Popover do modo Pontual.
- Em `handleSubmit`: gerar as datas do intervalo com loop de `date-fns` (`eachDayOfInterval`), validar tamanho máximo de 31 dias, e produzir uma linha por closer × dia × faixa em `closer_blocks` (mesmo formato do modo Pontual: `is_recurring: false`, `block_date` por dia).
- Substituição de bloqueios sobrepostos: escopo passa a ser `block_date` dentro do intervalo (`gte`/`lte`) + recorrentes dos dias da semana presentes no intervalo, mantendo o filtro de contenção por horário.
- Aviso de reuniões dentro do bloqueio: query de `agendamentos` com `scheduled_date` entre início e fim do período.
- `canSubmit`: modo Período exige `dateRange.from` e `dateRange.to` válidos.
- Limpeza do formulário após sucesso também limpa o intervalo. Invalidações de queries inalteradas.
- Sem migração, sem mudança de RLS, permissões ou API.
