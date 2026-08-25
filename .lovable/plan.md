# Verificação: "Resultado da Reunião" não registra / trava volta a aparecer

## O que a verificação mostrou

Checagem feita no banco (últimos 10–30 dias):

- Não há venda registrada com a reunião ainda em aberto: zero linhas em `vendas` cujo agendamento esteja em `agendada / confirmada / nao_confirmada / pendente`. Ou seja, **não há perda de dados já gravados** hoje.
- Os registros de auditoria `call_realizada_registrada` das últimas horas estão todos com o agendamento em `realizada` — o fluxo funciona na maioria dos casos.
- Foram encontrados casos em que a reunião foi marcada `realizada` e **depois revertida por outra pessoa** para `confirmada / no_show / cancelada` (ex.: 25/08 — dois casos para `no_show` e um para `confirmada`; também em 21/08 e 17/08). Quando isso acontece, a reunião volta a aparecer na trava para o closer, como se nunca tivesse sido registrada.

Além disso, o código tem duas falhas reais que produzem exatamente a reclamação:

1. **Gravação sem confirmação de linha afetada.** Em `src/components/VendaDialog.tsx` o `update` do status (`agendamentos` → `realizada`) e o `update` da tabela `vendas` são enviados sem verificar quantas linhas foram alteradas. Se a política de acesso bloquear (caso típico: o closer que preenche não é o closer vinculado à agenda, nem o criador), o banco responde **sem erro e sem alterar nada** — o sistema mostra "Reunião registrada como realizada!" e nada foi salvo. É o cenário exato descrito pelos closers.
2. **A trava não é atualizada na hora.** Ao concluir, só são invalidados os caches `agendamentos` e `vendas`. A lista da trava (`overdue-meetings`) e o banner de pendências (`pending-meetings`) não são invalidados, então a reunião continua listada na tela de travamento até o próximo ciclo (5 min) — dando a impressão de que o registro não foi aceito. O mesmo vale para o caminho `/venda/:id`.

## Correções propostas

1. `src/components/VendaDialog.tsx`
   - Adicionar `.select("id")` ao `update` de `vendas` e ao `update` de `agendamentos` e falhar com mensagem clara ("Você não tem permissão para registrar o resultado desta reunião — acione o gestor") quando nenhuma linha for alterada. Sem linha alterada, nada de toast de sucesso, nada de webhook, nada de auditoria.
   - Só gravar auditoria/webhook depois de confirmar que status e venda foram efetivamente persistidos.
2. Invalidação de cache após sucesso
   - Em `src/pages/DashboardPage.tsx` (`onSuccess` do `VendaDialog`) e em `src/pages/VendaPage.tsx`: invalidar também `overdue-meetings`, `pending-meetings` e `reunioes-list`, para a trava sair imediatamente.
3. Diagnóstico permanente
   - Registrar em auditoria uma entrada de falha (`call_realizada_bloqueada`) quando a gravação for barrada, com o id da agenda e o closer, para conseguirmos identificar rapidamente quem está sendo bloqueado.

## Sobre as reversões de status

A reversão de `realizada` por gestor/moderador é intencional (ação "Reverter status"), mas hoje o closer não recebe nenhum aviso e volta a ser travado sem entender o motivo. Sugestão (opcional, confirmar): ao reverter uma reunião que já estava `realizada`, enviar notificação ao closer com o motivo informado. Se preferir, faço isso em uma etapa separada.

## Detalhes técnicos

- `VendaDialog.handleSubmit`: `update(...).eq(...).select("id")` + checagem `data.length === 0`; mesma checagem no update de `agendamentos`; `insert` mantém o erro atual.
- Políticas envolvidas (sem alteração de banco): `vendas` INSERT/UPDATE e `agendamentos` UPDATE exigem `is_manager_or_sdr()` OU `created_by = auth.uid()` OU `is_closer() AND closer_id = current_closer_id()`.
- Nenhuma migração de banco necessária, exceto se aprovarmos a notificação de reversão (usa a tabela `notifications` já existente).
