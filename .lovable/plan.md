# Evitar que venda de reunião seja lançada como "venda avulsa"

## O que aconteceu (verificado nos dados)

A venda de 12/09 que aparece em "De 1ª call" e não entra na Taxa de Conversão é a da **Leslie Litano Tealdi Nascimento**. Ela tem uma **reunião real em 12/09 às 15:00, status realizada, closer Geraldo**, na qual o closer já havia marcado "vendeu = sim". Em vez de lançar a venda pelo botão "Registrar / atualizar venda" no card do lead, o gestor usou "Nova venda avulsa", criando um registro paralelo (telefone digitado incompleto, horário 00:00, marcado como avulsa). Como a Taxa de Conversão ignora vendas avulsas de propósito, o dia ficou "0 de 29".

## O que muda

### 1. Trava no "Nova venda avulsa" (dupla verificação)

Assim que o nome ou o telefone estiverem preenchidos, e novamente ao clicar em "Registrar venda", o sistema procura reuniões reais desse lead (por telefone ou por nome).

- **Reunião no mesmo dia da venda** → o botão "Registrar venda" fica **bloqueado** e aparece um aviso em destaque: "Este lead tem reunião em 12/09 às 15:00 com Geraldo. Esta venda deve ser lançada na reunião, não como avulsa." Com dois botões: **Abrir a reunião e lançar a venda lá** (fecha o modal e abre o "Registrar / atualizar venda" daquela reunião, já com produto, valores e descrição digitados aproveitados) e **Ainda assim registrar como avulsa**, que exige uma justificativa de no mínimo 30 caracteres e fica registrada na auditoria.
- **Reunião em outra data (últimos 90 dias)** → aviso amarelo, não bloqueia: "Este lead tem reunião em 08/09. Confirme se esta venda não pertence àquela reunião." Também oferece o atalho para abrir a reunião.
- **Nenhuma reunião encontrada** → fluxo segue exatamente como hoje.

### 2. Deixar claro para quem lança

- No topo do modal de venda avulsa, uma faixa explicativa: "Use este formulário só para vendas sem reunião no sistema. Se o lead teve reunião, lance a venda pelo card da reunião no calendário."
- Na pergunta de origem da venda ao vincular pela reunião, as opções continuam **1ª call** e **follow-up / 2ª reunião**, como já existe hoje no lançamento do gestor.

### 3. Correção do caso da Leslie (12/09)

Transferir a venda de R$ 5.000 para a reunião real de 12/09 15:00, marcada como **1ª call**, e desfazer o registro avulso duplicado (o registro fantasma fica marcado como excluído com justificativa, sem apagar histórico). Isso altera dados já gravados, então executo somente após a sua confirmação.

## Detalhes técnicos

- `src/components/dashboard/AvulsaSaleDialog.tsx`:
  - Nova query (`react-query`, `enabled` com nome ≥ 3 letras ou telefone ≥ 10 dígitos) em `agendamentos`: `deleted_at is null`, `is_venda_avulsa = false`, últimos 90 dias, casando por sufixo de 8+ dígitos do telefone **ou** `lead_name ilike`; retorna id, data, hora, status e closer.
  - `sameDayMeeting` = reunião com `scheduled_date === format(saleDate,'yyyy-MM-dd')`. Quando existir: `valid` passa a exigir `overrideJustificativa.trim().length >= 30`; banner destrutivo com os dois botões.
  - Atalho "abrir a reunião": callback novo (`onOpenVendaReuniao(agendamentoId, prefill)`) exposto pelo componente pai (`VendasTab` / `DashboardComercialPage`), que abre o `GestorVendaDialog` existente para aquele agendamento.
  - `logAudit`: `venda_avulsa_registrada` passa a incluir `override_reuniao_mesmo_dia`, `agendamento_conflitante` e a justificativa.
- Correção da Leslie: `update` em `vendas` (id a2f1a8ec…) definindo `vendeu = true`, `valor = 5000`, `valor_total_projeto`, `produto`, `venda_origem = 'primeira_call'`, `closed_at = 2026-09-12`; e soft delete do agendamento avulso d4b2355c… com `deletion_reason` explicando a duplicidade (a venda dele volta a `vendeu = false`).
- Sem migração, sem alteração na RPC `dashboard_conversao_period`, no lote diário do CRM ou nos outros cartões.
- Nova regra anotada no `roadmap.md`.

## Validação

- 12/09 após a correção: Taxa de Conversão deixa de ser 0 de 29 e conta a venda da Leslie; "Total subidas no período" continua 2.
- Tentar lançar venda avulsa para um lead com reunião no mesmo dia mostra o bloqueio; sem reunião, salva direto como hoje.
