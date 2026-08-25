# Reagendamento vs. Nova Reunião — lógica a partir de hoje

## Escopo
- Sem correção retroativa: o histórico até hoje (25/08/2026) fica como está. A regra vale para agendamentos criados de hoje em diante.
- Nenhuma coluna nova no Ranking de SDRs. Como reagendamento agora é só remanejo de horário, ele não entra na contagem de produção — "Criadas" continua contando apenas agendas novas.

## Como o sistema classifica de agora em diante

Ao criar um agendamento para um lead que já tinha reunião:

- Vira **Reagendamento** só se a reunião anterior do mesmo lead ainda estiver **agendada** ou **confirmada** (algo que ainda ia acontecer e foi remanejado). A anterior passa para "reagendada".
- Se a anterior estiver **no-show**, **cancelada**, **reagendada** ou **realizada**, a nova conta como **Nova reunião** (recuperação de lead = produção nova do SDR).
- Reagendamento explícito feito pela tela de reagendar continua sendo reagendamento.

## Abrangência do reagendamento (resposta à dúvida)

Reagendamento **não** é limitado ao mesmo dia:

- A nova data pode ser qualquer dia (hoje, amanhã, semana seguinte).
- O que limita é a **reunião de origem**: ela precisa ter data agendada dentro dos últimos 7 dias e ainda estar agendada/confirmada. Fora dessa janela, o sistema trata como nova reunião.
- No reagendamento explícito (pela tela), não há janela de 7 dias — o vínculo é direto, para qualquer data futura.

## Detalhes técnicos

- `public.detect_and_mark_reschedule()` já está com a regra de status (`agendada`/`confirmada`) aplicada. Nenhuma migração nova é necessária.
- Nenhum `UPDATE` de limpeza histórica em `agendamentos`.
- Nenhuma alteração em `src/pages/DashboardComercialPage.tsx` (colunas "Reagend." / "Total geração" descartadas).

Ou seja: não resta trabalho de código — apenas a confirmação de que a lógica acima é a vigente.
