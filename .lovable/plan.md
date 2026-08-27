# Bloqueio pessoal só em horário vazio

Regra: um closer não pode criar compromisso/bloqueio pessoal em um horário que já tenha reunião agendada. Gestor/admin continua podendo (bloqueio em massa), apenas com aviso.

## Comportamento

- Closer abre "Meus Compromissos Pessoais" e tenta salvar um bloqueio 12:00–13:00:
  - Se houver reunião ativa dele que se sobreponha ao intervalo, a criação é recusada com mensagem clara: motivo, data, horário e nome do lead em conflito.
  - Se o horário estiver vazio, salva normalmente.
- Bloqueio recorrente (ex.: toda terça 12:00–13:00): recusa a criação se existir reunião ativa em qualquer terça futura nesse intervalo, listando as datas conflitantes.
- Reuniões canceladas, "não compareceu" (no-show) e excluídas não contam como conflito.
- Bloqueio em massa (gestor/admin): continua criando, mas mostra aviso informando quantas reuniões ficarão dentro dos bloqueios criados.

## Detalhes técnicos

1. Nova função de validação no banco (`security definer`) + trigger `BEFORE INSERT` em `public.closer_blocks`:
   - Só valida quando o autor é closer sem papel de gestão (`has_role(auth.uid(),'gestor'/'moderador'/'supervisor')` falso).
   - Conflito = `agendamentos` do mesmo `closer_id`, `deleted_at IS NULL`, status em (`pendente`, `confirmada`, `nao_confirmada`, `agendada`, `realizada`), com sobreposição de intervalo calculada a partir de `scheduled_time` + `duration_minutes` vs `start_time`/`end_time`.
   - Pontual: compara com `block_date`. Recorrente: compara com todas as reuniões futuras (a partir de hoje, BRT) cujo `EXTRACT(DOW FROM scheduled_date) = recurrence_weekday`.
   - Em conflito, `RAISE EXCEPTION` com mensagem em português contendo data/horário/lead.
2. Pré-checagem no front (`src/components/CloserBlockDialog.tsx`): consulta os agendamentos do closer antes do insert e mostra toast detalhado com os conflitos, evitando erro cru do banco; se o insert ainda falhar pela trigger, exibe a mensagem retornada.
3. `src/pages/BloqueioMassaPage.tsx`: após criar, contabiliza reuniões ativas dentro dos intervalos e exibe toast de aviso (sem impedir).
4. Uso dos helpers de `src/lib/timezone.ts` para "hoje" em America/Sao_Paulo.
