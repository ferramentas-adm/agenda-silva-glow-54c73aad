# Leads desqualificados e closers em treinamento

## O que muda para quem usa

### 1. Tela de Agendar — marcar lead desqualificado
- Novo interruptor **"Lead desqualificado"** na etapa de confirmação (junto de Origem/Canal), visível apenas para gestores/moderadores, com explicação curta: "Só pode ser alocado com closer em treinamento".
- Ao ligar o interruptor:
  - a lista de closers passa a mostrar **apenas closers em treinamento**;
  - se um closer normal já estava escolhido, a escolha é limpa com aviso;
  - a contagem de horários livres passa a considerar só os closers em treinamento.
- Ao desligar, a lista volta a mostrar apenas os closers normais (os em treinamento ficam fora, ver item 2).
- O flag **não aparece** no card do calendário, na lista de reuniões do closer, no Meet, na confirmação/lembrete do lead nem em nenhuma outra interface do closer — somente nas telas de gestor (Agendar, Admin, Dashboard Comercial).

### 2. Usuários — closer em treinamento
- Na lista de usuários de Administração, cada usuário com função **Closer** ganha o controle **"Em treinamento"**.
- Enquanto estiver em treinamento, esse closer:
  - **não** aparece mais para leads normais (sai da distribuição comum);
  - aparece **somente** quando o agendamento está marcado como lead desqualificado.
- Trocar esse controle fica registrado no histórico de atividades.

### 3. Trava de segurança
- Mesmo que a tela seja burlada, o banco recusa gravar uma reunião de lead desqualificado com closer que não esteja em treinamento (e o contrário: closer em treinamento só recebe reunião de lead desqualificado). A mensagem de erro explica o motivo.
- Reunião de lead desqualificado sem closer continua permitida (fila de atribuição).
- Ao atribuir/transferir closer pelo calendário ou pela fila, a mesma regra vale.

### 4. Dashboard — Métricas SDRs
- Reuniões de leads desqualificados **saem de todas as contagens da aba "Métricas SDRs"** (total do dia, agendadas, confirmadas, realizadas, canceladas, no-show, taxa de comparecimento e drill-downs).
- Os cards do Calendário continuam contando tudo, como hoje (decisão do usuário).

### 5. Dashboard — Vendas
- Vendas de leads desqualificados **continuam contando** normalmente nos números de venda.
- Novo card **"Vendas Fechadas (desqualificados)"** ao lado de "Vendas Fechadas", mostrando quantas dessas vendas vieram de lead desqualificado, com drill-down.
- O card atual "Vendas Fechadas" passa a mostrar, na linha de apoio, quantas do total são de leads desqualificados (aparta sem esconder).

## Detalhes técnicos

Migração (aditiva, sem quebra):
- `agendamentos.lead_desqualificado boolean not null default false` + índice parcial `where lead_desqualificado`.
- `closers.em_treinamento boolean not null default false`.
- Trigger `BEFORE INSERT OR UPDATE OF closer_id, lead_desqualificado ON public.agendamentos` chamando nova função `enforce_desqualificado_closer_treinamento()` (`security definer`, `search_path = public`): quando `closer_id is not null`, exige `lead_desqualificado = closers.em_treinamento`; `RAISE EXCEPTION` com texto em português. Ignora linhas com `deleted_at is not null`.
- `reassign_agendamento_closer_for_result` e `transfer_agendamento_closer` continuam válidas — a checagem roda no trigger, sem duplicar regra.

Frontend:
- `src/pages/AgendarPage.tsx`: estado `leadDesqualificado`; `Switch` na etapa de confirmação; grava `lead_desqualificado` no insert e no update de mesmo dia; limpa `closerId` quando o valor muda; passa a flag para `CloserSelector` e para `useSlotCounts`/`useSlotLimit`.
- `src/components/agendar/CloserSelector.tsx`: nova prop `treinamento: boolean`; a query passa a filtrar `closers.em_treinamento` igual à flag e entra na `queryKey`.
- `src/hooks/useSlotCounts.ts`: nova opção `treinamento` — capacidade e contagem consideram somente o subconjunto de closers correspondente (chave de cache inclui a flag). Sem closer elegível livre → horário mostrado como cheio (trava pedida).
- `src/pages/AdminPage.tsx`: linha de usuário com função closer ganha `Switch` "Em treinamento" que faz `update` em `closers.em_treinamento` casando por e-mail do perfil, com `logAudit("toggle_closer_treinamento", ...)`; o `select` de closers da página passa a trazer o campo.
- `src/pages/DashboardComercialPage.tsx`: as consultas de agendamentos passam a trazer `lead_desqualificado`; o pool enviado a `computeAgendaMetrics` na aba "Métricas SDRs" filtra `!lead_desqualificado`. `src/lib/agendaMetrics.ts` recebe o campo em `AgendaMetricInput` (documentado), sem mudar a regra usada pelo Calendário.
- `src/components/dashboard/VendasTab.tsx`: as queries de vendas passam a trazer `agendamentos.lead_desqualificado`; novo `KpiCard` "Vendas Fechadas (desqualificados)" com drill-down reaproveitando `MetricDrilldownDialog`; linha de apoio no card "Vendas Fechadas".
- Tipos regenerados após a migração. Sem alteração em RPCs de vendas/conversão, lote diário do CRM, CAPI ou endpoints `silva-*`.
