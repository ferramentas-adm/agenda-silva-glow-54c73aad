# Cobrar o Closer quando o gestor marca "Realizada"

## Situação atual

Quando o gestor marca uma reunião como "Realizada", o status é gravado direto (sem a janela "Vendeu?") e a reunião deixa de aparecer na trava, porque a trava só considera reuniões com status ativo (agendada, confirmada, não confirmada). Resultado: o Closer não é mais cobrado e a reunião pode ficar sem resultado de venda.

## O que muda

- Reuniões marcadas como "Realizada" **que ainda não têm resultado de venda lançado** passam a continuar na trava do Closer responsável, até ele preencher "Vendeu? Sim/Não".
- Nesse caso a trava mostra só as ações do Closer (abrir a janela de resultado). Não aparece para o SDR, e nada muda para o gestor.
- Assim que o resultado é lançado (venda ou não venda), a reunião sai da trava imediatamente.
- Reuniões realizadas que já têm resultado lançado continuam fora da trava, como hoje.
- Reuniões realizadas sem Closer definido não travam ninguém (segue como caso de gestor).
- Mesma regra de tolerância de tempo já usada hoje (1h05 após o horário).

## Detalhes técnicos

Arquivos envolvidos:

- `src/hooks/useOverdueMeetings.ts`
  - Incluir `"realizada"` na lista de status buscados, mas apenas na condição de Closer (`closer_id = meu closer`); a etapa SDR continua restrita aos status ativos.
  - Após montar a lista de vencidas, buscar em lote `vendas` por `agendamento_id in (ids realizadas)` e descartar as que já possuem registro.
  - Para as realizadas remanescentes, forçar `stage = "closer"` (independente de `sdr_handoff_at` / `closer_returned_at`) e exigir `closer_id` não nulo.
  - Adicionar flag `needs_result: boolean` no tipo `OverdueMeeting` para a UI diferenciar o texto.

- `src/components/OverdueMeetingsLockOverlay.tsx`
  - Para itens com `needs_result`, exibir rótulo do tipo "Reunião marcada como realizada pelo gestor — registre o resultado" e mostrar somente a ação que abre o diálogo de resultado (`VendaDialog`); esconder "Não compareceu", devolver ao SDR e encaminhar.
  - Ao salvar o resultado, invalidar `["overdue-meetings"]` (já existe padrão de invalidação) para o item sair da trava na hora.

- Realtime/polling: o canal atual escuta UPDATE em `agendamentos` filtrado por `closer_id`, o que já cobre a transição para "realizada". Adicionalmente, invalidar a query após inserir em `vendas` no fluxo do diálogo.

Sem alteração de schema, RLS, payloads de CRM ou permissões de gestor.

## Validação

- Gestor marca "Realizada" → Closer vê a trava pedindo o resultado; SDR não vê nada.
- Closer lança "Vendeu = Sim" e "Vendeu = Não" → em ambos os casos a reunião sai da trava.
- Reuniões realizadas com resultado já lançado não voltam a travar (checar histórico antigo para não travar em massa reuniões antigas sem venda registrada — confirmar contagem antes de ativar; se o volume histórico for alto, limitar a regra às reuniões dos últimos 30 dias).
- Gestor/moderador/supervisor/apresentador continuam sem trava.
