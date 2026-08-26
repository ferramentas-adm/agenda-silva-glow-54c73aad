# Análise de motivos de não comparecimento (nova aba no Dashboard)

## O que será criado

Uma nova aba **"Não comparecimento"** dentro do Dashboard (Dashboard Comercial), com:

- **Gráfico de pizza** com a distribuição dos motivos escolhidos no diálogo "Não compareceu" (No-show, Cancelou por desistência, Cancelou por imprevisto pessoal, Sem closer disponível, Alterou horário para o mesmo dia, além de motivos personalizados cadastrados em Administração > + Listas).
- **Legenda com quantidade e percentual** por motivo, e total geral de não comparecimentos no período.
- **Resumo por quadro**: quantos caem em "Cancelado" e quantos em "No-show", seguindo a classificação já existente do sistema.
- **Filtro de período** usando o mesmo seletor de datas do print (presets como Hoje, Ontem, Últimos 7/14/28/30 dias, Esta semana, Mês passado, intervalo personalizado e seleção de dia específico), com fuso America/Sao_Paulo.
- **Filtro por closer e por SDR** (opcional, dropdown) e alternância entre contar pela **data da reunião** ou pela **data de criação** da agenda.
- Clique numa fatia abre a lista dos agendamentos daquele motivo (nome do lead, telefone, data/hora, closer, SDR).

Se não houver registros no período, a aba mostra uma mensagem vazia em vez de gráfico.

## Detalhes técnicos

- Nova aba `nao_comparecimento` em `TABS` de `src/pages/DashboardComercialPage.tsx` (visível para gestor/moderador/apresentador, como as demais abas gerenciais), incluída no controle de visibilidade por usuário e na rotação automática.
- Novo componente `src/components/dashboard/NaoComparecimentoTab.tsx`:
  - Query própria (`useQuery`) em `agendamentos` filtrando `status in ('no_show','cancelada')`, `deleted_at is null`, período pelo campo escolhido (`scheduled_date` ou `created_at`), selecionando `id, lead_name, lead_phone, scheduled_date, scheduled_time, created_at, status, cancellation_reason, closer_id, created_by, sdr_responsavel_id`.
  - Agrupamento por `cancellation_reason` normalizado; registros antigos sem motivo entram como "Sem motivo informado".
  - Classificação Cancelado/No-show reutilizando `classifyNaoCompareceu`/`splitNaoCompareceu` de `src/lib/noShowReasons.ts` (inclui a regra de "Alterou horário para o mesmo dia").
  - Pizza com `PieChart`/`Pie`/`Cell`/`Tooltip`/`Legend` do recharts (já usado no projeto), cores via tokens semânticos do design system.
  - Drill-down reaproveitando `MetricDrilldownDialog` quando compatível; caso contrário, uma tabela simples dentro de `Dialog`.
- Filtro de datas: `FacebookDateRangePicker` (`src/components/FacebookDateRangePicker.tsx`) com estado local da aba, sem alterar o período global da página.
- Nenhuma mudança de banco de dados nem de lógica de gravação de motivos.
