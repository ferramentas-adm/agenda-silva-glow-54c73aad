# Origem do lead + Canal do agendamento

## O que muda

1. **"Tipo de Canal" passa a se chamar "Origem do lead"** em todo o sistema: tela Novo Agendamento, detalhes do agendamento, Lista de Reuniões (coluna e filtro), Aguardando Atribuição, Nova venda avulsa, painéis do Dashboard (inclusive o quadro "Agendas por Canal", que passa a se chamar "Agendas por Origem do Lead") e Configurações Gerais. Só o rótulo muda — os dados e as opções continuam iguais.

2. **A marcação "Mentoria com Antônio" sai da tela** de Novo Agendamento. Nada é apagado: reuniões já marcadas continuam marcadas no banco e nos envios para o CRM.

3. **No lugar dela entra "Canal do agendamento" (obrigatório)**: dois botões lado a lado, cada um com um círculo de seleção, mostrando qual canal o SDR usou para marcar a reunião:
   - WhatsApp (CRM)
   - Ligação API4COM

   Sem escolher um dos dois não é possível confirmar o agendamento. Agendamentos antigos ficam como "Não informado".

4. **Novo quadro em "Produtividade SDR"**: "Por canal do agendamento", com uma linha para cada canal (mais "Não informado") e as colunas: agendamentos criados, reuniões realizadas, vendas e conversão. Respeita o período e os filtros já existentes da aba, e cada número é clicável para abrir a lista de leads (mesmo drilldown já usado).

## Detalhes técnicos

- Migração: nova coluna `agendamentos.booking_channel text` (nullable, `CHECK (booking_channel IN ('whatsapp_crm','ligacao_api4com'))`) + índice `(booking_channel, created_at)`. Nenhuma alteração em `channel_type` nem em `is_5k`.
- Nova RPC `dashboard_agendamentos_por_booking_channel(_from date, _to date, _base text)` retornando por canal: `qtd_created`, `qtd_realizada`, `qtd_vendas`, e arrays de ids para drilldown — mesmo padrão de `dashboard_agendas_por_canal` (agregação server-side, sem trazer linhas para o cliente). Base por data de criação (America/Sao_Paulo, offset -03), coerente com a aba SDR.
- `src/pages/AgendarPage.tsx`: remover o bloco do Switch `is-5k-toggle` e o estado `is5k` da UI (o insert continua enviando `is_5k: false` para não quebrar o schema); novo estado `bookingChannel` com dois cards selecionáveis (`CheckCircle2` do lucide, grid `grid-cols-2`), incluído na validação de envio e no insert/update de `agendamentos`.
- Rótulos: substituir "Tipo de Canal" por "Origem do lead" em `AgendarPage.tsx`, `DashboardPage.tsx`, `ReunioesListPage.tsx`, `AguardandoAtribuicaoPage.tsx`, `AdminPage.tsx`, `AvulsaSaleDialog.tsx`, `MetricDrilldownDialog.tsx`, `VendasTab.tsx`, `AgendasPorCanalPanel.tsx`, `NovoAgendamentoPromptDialog.tsx`, `OverdueMeetingsLockOverlay.tsx`, `PendingMeetingsBanner.tsx`, `SDRErrorDetailsDrawer.tsx`. Chaves técnicas (`channel_type`) e payloads de CRM/edge functions permanecem inalterados.
- Novo componente `src/components/dashboard/BookingChannelPanel.tsx` (tabela + totais + drilldown via `MetricDrilldownDialog`), renderizado em `ProdutividadeSDRTab.tsx` abaixo dos cards de resumo.
- `booking_channel` fica disponível para leitura no MCP/endpoints somente se necessário depois; nesta etapa não altero `silva-reunioes` nem `silva-vendas`.
