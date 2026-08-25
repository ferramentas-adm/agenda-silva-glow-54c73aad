# Revisão da lógica de "Reagendamento"

## Como funciona hoje

Existem dois caminhos que marcam uma agenda como reagendamento:

1. **Reagendamento explícito** — o usuário usa o fluxo de reagendar uma reunião existente; a nova agenda nasce apontando para a antiga.
2. **Detecção automática por telefone** (gatilho `detect_and_mark_reschedule` no banco) — em TODO novo agendamento, o sistema procura outra agenda do mesmo telefone com data agendada nos últimos 7 dias e que **não** esteja "realizada". Se encontra, vincula a nova agenda como reagendamento da anterior — **independentemente** de a anterior estar como `no_show`, `cancelada` ou `reagendada`.

É exatamente o caso do Jonatas: ele clicou em "Agendar" normalmente, mas o lead tinha uma agenda de 24/08 marcada como `no_show`/`cancelada`, então o gatilho vinculou automaticamente e a agenda passou a contar como reagendamento, saindo da métrica "Criadas". Confirmei isso nos dados de 25/08: a maioria das agendas vinculadas hoje tem a anterior em `cancelada` ou `no_show`.

Ou seja: sim, faz sentido a reclamação. Uma reunião reconquistada depois de um no-show/cancelamento é geração nova de agenda, não um simples remanejamento de horário.

## O que muda

Ajustar a detecção automática para vincular como reagendamento **apenas quando a agenda anterior ainda está viva** (`agendada` ou `confirmada`) — ou seja, quando de fato é troca de horário de uma reunião pendente.

Quando a agenda anterior estiver em `no_show`, `cancelada` ou `reagendada`, a nova agenda passa a ser tratada como **nova reunião** (sem vínculo, contando em "Criadas").

O fluxo de reagendamento explícito continua igual: quem reagenda pela tela de detalhes segue gerando reagendamento normalmente.

## Correção do histórico

Opcionalmente, desvincular as agendas já criadas por essa detecção equivocada (as que apontam para uma anterior em `no_show`/`cancelada`) para que as métricas passadas de "Criadas" fiquem corretas. Isso pode ser aplicado apenas de uma data em diante (ex.: mês atual) para não mexer em histórico antigo — confirme a janela desejada.

## Detalhes técnicos

- Migração alterando `public.detect_and_mark_reschedule()`: na busca da agenda anterior, restringir a `a.status IN ('agendada','confirmada')` em vez de `a.status <> 'realizada'`. O bloco de `original_agendamento_id` já informado (reagendamento explícito) permanece intacto.
- Sem mudanças de front-end: `DashboardComercialPage.tsx` e `ProdutividadeSDRTab.tsx` já usam `original_agendamento_id` como critério; com a correção no gatilho, as contagens ficam certas automaticamente.
- Correção de histórico (se aprovada): update em `agendamentos` zerando `original_agendamento_id` nas linhas cuja agenda anterior está em `no_show`/`cancelada`, dentro da janela de datas escolhida.
