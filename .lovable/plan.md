# Remover "Segunda Reunião" do channel_type

O campo `channel_type` deixa de aceitar o valor especial `"Segunda Reunião"`. Em agendamentos de 2ª reunião, o canal passa a ser **herdado automaticamente do 1º agendamento** (mesmo telefone normalizado), tanto no banco quanto no webhook. O fato de ser 2ª reunião continua sendo identificado por `meeting_reason = 'segunda_reuniao'` e `is_segunda_reuniao: true`.

## Mudanças

### 1. `src/pages/AgendarPage.tsx`
- Remover o `useEffect` (linhas ~93-97) que força `channelType = "Segunda Reunião"` quando o usuário é closer.
- Ao carregar 2ª reunião (closer ou admin marcando), buscar o `channel_type` do agendamento original (mesmo telefone, mais antigo, não excluído) e pré-preencher. Já existe lookup similar nas linhas ~190-210 — estender para closer também.
- No INSERT (linha ~328): trocar `(isCloser || (isAdmin && adminAsSecondMeeting)) ? "Segunda Reunião" : channelType` por simplesmente `channelType || null` (ou o canal herdado).
- Na chamada de Google Calendar (linha ~380): mesma coisa, usar o canal herdado em vez de fixar string.
- Resumo/SummaryRow (linhas ~637 e ~664): mostrar o canal real (herdado) em vez do literal "Segunda Reunião". Para closer, exibir como label readonly (não editável), mostrando o canal herdado.
- Toggle "marcar como 2ª reunião" do admin (linhas ~599-600): parar de sobrescrever `channelType` com "Segunda Reunião"; manter o canal já preenchido.

### 2. Trigger `notify_status_change_webhook` (migration)
Hoje o webhook só lê `NEW.channel_type`. Para 2ª reunião o valor virá do INSERT (já herdado pelo front), então **nenhuma mudança no trigger é necessária** — desde que o front salve o canal correto. Confirmar lendo o último migration e deixando-o intacto.

### 3. Backfill (opcional, recomendado)
Atualizar registros antigos onde `channel_type = 'Segunda Reunião'` para o canal do agendamento original correspondente (match por telefone normalizado + `created_at` mais antigo da mesma série). Onde não houver match, deixar `NULL`. Executado via `supabase--insert` com um único UPDATE.

## Detalhes técnicos

- A busca do canal original usa o mesmo padrão já existente no `detect_and_mark_reschedule` e no trecho do trigger para `_sdr_name` em 2ª reunião: `regexp_replace(lead_phone, '\D', '', 'g')` + `ORDER BY created_at ASC LIMIT 1`.
- No front, fazer o lookup quando: (a) usuário é closer ao abrir AgendarPage com lead selecionado, ou (b) admin marca toggle "2ª reunião". Reaproveitar a query que já existe em `loadPrior` (linhas ~190-210) — hoje ela ignora o canal para closer; basta remover essa condicional.
- Nenhuma alteração em `AdminPage` / `useAppSettingList` — a lista "Tipos de canal" já é a fonte única.
- Edge functions (`datacrazy-*`) não precisam mudar: continuam repassando `channel_type` como vier.

## Fora de escopo

- Não alterar `meeting_reason` (continua tendo "Segunda Reunião" na lista de motivos, que é diferente de canal).
- Não tocar em RLS, schema ou estrutura de tabelas.
