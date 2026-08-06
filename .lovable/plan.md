# Clayton aparecendo na agenda como Closer

## Situação confirmada (consulta ao banco)

Clayton Martins:
- função atual: `sdr`
- disponível para agendamento: **não**
- registro de closer: **ainda ativo** (`closers.active = true`)

Por isso ele continua listado como disponível na agenda: as telas de agenda/seleção de closer filtram apenas por `closers.active = true`, sem olhar função nem "disponível para agendamento".

## Correção

1. **Dado imediato:** desativar o registro de closer do Clayton (`active = false`). Ele sai da agenda na hora; o histórico de reuniões dele é preservado.

2. **Causa raiz (edge function `manage-user`):** hoje o registro de closer só é desativado quando a função *anterior* era exatamente `closer`. Se a pessoa vinha de moderador/gestor/apresentador (ou já tinha registro de closer criado pelo toggle de agendamento), o registro fica ativo. Ajuste: ao trocar para uma função diferente de `closer`, desativar o registro de closer sempre que `available_for_scheduling` for falso — independente da função anterior.

3. **Rede de segurança na agenda:** ao listar closers disponíveis, considerar apenas quem é `closer` por função **ou** tem `available_for_scheduling = true`, para que uma inconsistência de dado não volte a expor um SDR como disponível.

## Detalhes técnicos

- Update de dados em `public.closers` (sem migração de schema).
- `supabase/functions/manage-user/index.ts`: ajustar o bloco `change_role` (desativação do closer) e revalidar em `toggle_scheduling`.
- Front: filtro de disponíveis em `src/components/agendar/CloserSelector.tsx` (e demais pontos que consultam `closers` com `active = true`) cruzando com `profiles`/`user_roles`.
