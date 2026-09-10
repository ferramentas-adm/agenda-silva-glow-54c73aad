# Planilha diária de motivos de não fechamento no Google Sheets

Sim, é possível. Todo dia, logo depois da meia-noite (horário de Brasília), o sistema fecha o dia anterior e envia os leads com motivo de não fechamento para uma planilha no Google Sheets.

## Como vai funcionar

- Uma planilha por mês, criada automaticamente. Nome: `Motivos de Não Fechamento — 09/2026`.
- Uma aba por dia, criada quando o dia é enviado. Nome da aba: `10-09-2026`.
- Quando virar o mês, o sistema cria uma planilha nova e passa a usá-la (a antiga fica intacta).
- Se um dia for reenviado, a aba daquele dia é reescrita, sem duplicar linhas.
- Na Administração fica um botão para enviar/reenviar um dia específico à mão, e a lista de planilhas já criadas com o link de cada mês.

## Colunas de cada aba

Data da reunião · Hora · Lead · Telefone · Closer · SDR · Origem do lead · Canal do agendamento · Motivo de não fechamento · Justificativa · Valor apresentado · Faturamento do lead · Data do lançamento

Uma linha de totais no topo com a contagem por motivo do dia.

## O que preciso de você

Conectar a conta Google que vai ser dona das planilhas. Vou abrir o cartão de conexão do Google Sheets — a planilha é criada nessa conta e você pode compartilhá-la com o time normalmente.

## Detalhes técnicos

- Conector: App connector `google_sheets` (via `standard_connectors--connect`), chamado pela gateway a partir da edge function — nunca do navegador. Também é preciso o conector `google_drive` para nomear/mover a planilha (opcional: sem ele a planilha nasce na raiz do Drive da conta).
- Nova tabela `sheets_motivos_exports`: `month` (`YYYY-MM`, único), `spreadsheet_id`, `spreadsheet_url`, `created_at`; e `sheets_motivos_runs`: `run_date` (único), `status`, `rows`, `error`, `lease_until`, `finished_at`. GRANT apenas para `service_role` (+ `SELECT` para `authenticated` na tabela de planilhas, para exibir os links no Admin). RLS habilitada.
- Nova edge function `sheets-motivos-daily` (`verify_jwt = false`, header `x-cron-secret`), seguindo o mesmo padrão de `crm-daily-vendas`:
  - lock de execução única (`lease_until`), marcação idempotente por `run_date`, limite de linhas por execução, e parada com registro de erro em falha (sem retry em loop).
  - fonte dos dados: `vendas` com `vendeu = false` e motivo preenchido, atribuídas pela data da reunião do `agendamento` (mesma regra usada hoje na aba Não comparecimento/Vendas), com joins em `closers` e `profiles` para nomes.
  - Sheets: `GET /v4/spreadsheets/{id}` para checar a planilha do mês; `POST /v4/spreadsheets` quando não existir; `batchUpdate` com `addSheet` para a aba do dia (ou limpar a existente) e `values/{range}` `PUT` com `valueInputOption=USER_ENTERED` para escrever as linhas. Sem `encodeURIComponent` no range.
  - erros da gateway são registrados em `sheets_motivos_runs.error` com status e corpo.
- Agendamento: `pg_cron` diário às `05:10 UTC` (02:10 BRT) chamando a função via `net.http_post` com o segredo — margem para lançamentos de fim de noite.
- Segredo `SHEETS_MOTIVOS_CRON_SECRET` gerado automaticamente.
- Admin: novo card em `src/pages/AdminPage.tsx` (visível a gestor/moderador/supervisor) com seletor de data, botão de envio manual, status da última execução e links das planilhas por mês.
- Datas sempre em `America/Sao_Paulo`, via helpers de `src/lib/timezone.ts` no front.
