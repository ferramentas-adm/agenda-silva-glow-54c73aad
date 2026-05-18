## Objetivo

1. Remover botão de "reagendamento" do fluxo do SDR.
2. Ao criar agenda, sistema detecta automaticamente se é reagendamento.
3. Autopreencher dados do lead quando ele já existir no banco.

## Regras de detecção

Marca como `reagendada` (em vez de `agendada`) quando, no momento da criação:
- Existe outra agenda do mesmo `lead_phone` (normalizado), e
- `scheduled_date` da anterior está dentro dos últimos **7 dias** (relativo a hoje), e
- A agenda anterior foi criada por usuário com role **SDR** (ignora Closer; Moderador/Gestor a definir — proposta: contar também), e
- `deleted_at IS NULL` na anterior.

Se positivo: status = `reagendada` e `original_agendamento_id` = id da anterior mais recente que satisfaz os critérios.

Normalização de telefone: remover tudo que não é dígito antes de comparar.

## Mudanças

### Frontend
- **`AgendarPage`**: remover toggle/fluxo "reagendamento" do SDR. Sempre cria como nova agenda.
- **`LeadSearch` / etapa de dados do lead**: ao selecionar lead (DataCrazy) ou digitar telefone, fazer lookup em `agendamentos` por telefone normalizado. Se encontrar histórico:
  - Preencher automaticamente nome, observação/briefing do último registro.
  - Mostrar mini-banner "Lead já teve N agendas — última em DD/MM com Closer X (status)" para contexto do SDR.
- Closer/Moderador continuam com fluxo de reagendamento manual normal (não muda nada pra eles).

### Backend (migração)
- Nova função `detect_and_mark_reschedule()` em trigger `BEFORE INSERT` em `agendamentos`:
  - Só age se `created_by` tem role `sdr`.
  - Busca agenda anterior do mesmo telefone normalizado, criada por SDR, com `scheduled_date >= current_date - 7`, não deletada.
  - Se achar: `NEW.status := 'reagendada'`; `NEW.original_agendamento_id := <id da anterior>`.
- A trigger `enforce_initial_agendamento_status` continua válida (não conflita: ela só converte 'confirmada'→'agendada').
- O webhook `notify_status_change_webhook` já trata `reagendada` no INSERT, então DataCrazy recebe corretamente.

### Audit
- Log adicional quando detecção marca reagendamento automático (pra rastreabilidade).

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Telefone com formatos diferentes não casa | Normalizar (só dígitos) na busca |
| SDR cancela e recria em minutos por erro de digitação → vira "reagendamento" | Aceito pelo usuário ("sempre marcar") |
| Métricas históricas mudam de baseline | Comunicar à equipe; opcional: aplicar regra só a agendas novas (sem backfill) |
| `original_agendamento_id` apontando para agenda cancelada | OK — é o comportamento desejado |
| Autopreenchimento sobrescreve dado novo do SDR | Preenche no momento da seleção do lead; SDR ainda edita antes de submeter |
| Lead que mudou de telefone perde vínculo | Aceito (caso raro) |
| Moderador/Gestor criando agenda para SDR | **Decisão pendente**: tratar como SDR ou ignorar? Proposta: ignorar (só conta se `created_by` é SDR puro) — evita confusão |

## Não inclui
- Backfill de agendas antigas (só vale daqui pra frente).
- Mudança no fluxo de reagendamento do Closer.
- UI nova de "histórico do lead" — só um banner curto na tela de agendar.
