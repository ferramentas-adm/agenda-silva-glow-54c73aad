# Revisão do dashboard — conversão e performance por closer

## Diagnóstico (confirmado nos dados de hoje, 25/09)

**1. Por que reuniões da Turma B entram na Taxa de Conversão**
Hoje o card filtra pelo **lead** (desqualificado fica de fora, a não ser que tenha pago), e não pelo **time do closer**. Os leads que foram agendados como qualificados continuam qualificados mesmo que o closer tenha passado para a Turma B. Hoje isso colocou 3 reuniões da Turma B no card:
- Bruno Casari: 2 reuniões realizadas com leads qualificados
- Lucca Lofiego: 1 reunião realizada com lead qualificado

O sistema também não guarda em qual time o closer estava no dia da reunião — só sabe o time dele agora.

**2. Por que o Lucca aparece com só 1 reunião realizada**
Hoje ele teve 11 reuniões na agenda:
- 4 marcadas como "Realizada" → só 1 conta. As outras 3 (12h, 14h, 16h) são de leads desqualificados sem venda paga, e a regra que você definiu tira essas reuniões de todos os números.
- 3 ainda estão em "Em call" (17h, 19h, 20h) → só contam depois que o closer mudar para "Realizada".
- 3 não compareceram e 1 está confirmada (21h).

Não é um erro: é a regra de desqualificados combinada com status que ainda não foram atualizados. Se quiser que a Performance por Closer mostre todas as reuniões realizadas (com ou sem lead desqualificado), é só me pedir. Esse item fica sem alteração neste plano.

## O que vou mudar

1. **Guardar o time de cada reunião.** Cada reunião passa a registrar o time (A ou B) do closer que ficou com ela. O time é gravado quando a reunião é criada ou trocada de closer e fica fixo quando a reunião vira "Realizada". Assim, se um closer mudar de time amanhã, os dias anteriores não mudam.
2. **Preencher as reuniões antigas** com o time atual de cada closer. Para os closers que mudaram de A para B hoje, as reuniões de hoje já ficam como B.
3. **Taxa de Conversão só com a Turma A.** O card passa a contar só reuniões realizadas da Turma A. A regra atual de leads desqualificados continua valendo.
4. Nada muda em Performance por Closer, faturamento, KPIs de vendas nem no calendário.

## Detalhes técnicos

- Migração: coluna `agendamentos.closer_turma text check in ('A','B')`, com trigger `BEFORE INSERT OR UPDATE OF closer_id, status`. O trigger lê `closers.em_treinamento` (true = B) enquanto o status não for `realizada` e congela o valor depois disso. A reatribuição por gestor com a reunião já realizada atualiza o valor pelo novo closer.
- Backfill: `update agendamentos a set closer_turma = case when c.em_treinamento then 'B' else 'A' end from closers c where c.id = a.closer_id`.
- `dashboard_conversao_period`: adicionar `AND a.closer_turma = 'A'` no CTE `ags`, sem mudar a assinatura. Com isso, o card do VendasTab e a ferramenta MCP `sales-kpis` passam a seguir a mesma regra.
- Verificação: rodar a RPC para 25/09 antes e depois da mudança. O total deve cair exatamente 3 reuniões (as 2 do Bruno e a 1 do Lucca).

---

## Ajuste 1 — Closer que vai do time A para o B passa os leads para outro closer da Turma A

**Como funciona hoje:** quando o gestor coloca um closer na Turma B em Admin, só o time dele muda. As reuniões que ele já tinha continuam com ele.

**O que vou mudar:**
1. Quando o gestor mover um closer de A para B, o sistema procura as reuniões futuras dele com **lead qualificado**. Entram as reuniões de hoje com horário ainda por vir e as dos próximos dias, com status agendada, confirmada, pendente ou não confirmada.
2. Cada uma dessas reuniões vai para um closer da **Turma A** que esteja livre naquele horário. O sistema usa as mesmas regras do agendamento: horário de trabalho, bloqueios, limite por hora e nenhum outro compromisso no mesmo horário. Quando houver mais de um closer livre, escolhe o que tem menos reuniões no dia.
3. O convite do Google Agenda e o link do Meet passam para o novo closer, do mesmo jeito que acontece numa transferência manual.
4. Se nenhum closer da Turma A estiver livre naquele horário, a reunião vai para a fila **"Aguardando Atribuição"** e os gestores recebem um aviso. Ela não fica com o closer da Turma B.
5. Antes de confirmar a troca de time, o gestor vê um resumo: quantas reuniões serão redistribuídas e para quem, e quantas vão para a fila. No fim, aparece o resultado.
6. Cada reunião movida fica na Auditoria como "Redistribuída por troca de turma".
7. As reuniões com leads desqualificados continuam com o closer, porque combinam com a Turma B. As reuniões que já passaram também não mudam.

**Detalhes técnicos:**
- Nova função `redistribuir-turma` (JWT de gestor ou moderador): ela muda `closers.em_treinamento` e redistribui as reuniões. Para escolher o closer, usa `_shared/disponibilidade.ts`. Para trocar o dono da reunião, usa `transfer_agendamento_closer` e depois `google-transfer-event`. Quando não há closer livre, usa o fluxo de desatribuição, o mesmo do `unassign_agendamentos_from_closer`.
- Modo `dry_run` para a prévia no diálogo de confirmação. O `handleToggleTreinamento` do AdminPage passa a chamar a função quando a troca for de A para B. A troca de B para A continua como está.

---

## Ajuste 2 — Lead desqualificado fica totalmente fora da Taxa de Conversão

**Como funciona hoje:** a reunião com lead desqualificado só entra no card quando gera uma venda paga. Com isso, ela entra no número de reuniões e também no número de vendas, e a taxa sobe de forma artificial.

**O que vou mudar:** a Taxa de Conversão passa a ignorar qualquer reunião com lead desqualificado, com ou sem venda. Ela sai do número de reuniões e do número de vendas. O card fica com: reuniões realizadas da Turma A com lead qualificado, e as vendas que saíram dessas reuniões.

**Continua igual:** essas vendas ainda aparecem no faturamento, no card "Vendas Fechadas (desqualificados)", no envio ao CRM e na Performance por Closer.

**Detalhes técnicos:** em `dashboard_conversao_period`, trocar a exceção "desqualificado com valor > 0" por `AND NOT COALESCE(a.lead_desqualificado,false)` no CTE `ags`. Isso vale também para as segundas reuniões ligadas a essas reuniões. Verificação: rodar a função para 25/09 e comparar o resultado antes e depois.
