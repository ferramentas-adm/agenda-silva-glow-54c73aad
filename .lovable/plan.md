# Reagendar = só troca de horário no mesmo dia

Documento para validação antes da implementação. Nada será alterado até você aprovar.

## 1. Como funciona hoje

Botão "Reagendar" (modal de detalhes do agendamento):

- **Mesma data** → já atualiza o próprio registro (novo horário, volta para "Aguardando atribuição"). Não cria duplicata, não marca "reagendada".
- **Outra data** → cria um novo registro apontando para o antigo (`original_agendamento_id`), e o antigo vira "reagendada". É esse caminho que gera o vínculo de reagendamento.

Além disso, o gatilho automático do banco vincula um novo agendamento a uma reunião anterior do mesmo telefone quando ela ainda está "agendada"/"confirmada" (janela de 7 dias).

## 2. Regra proposta

### 2.1 Botão "Reagendar"
- Passa a aceitar **apenas o mesmo dia** da reunião. O calendário do modal fica travado nessa data (só a escolha de horário fica disponível).
- Comportamento: atualiza o próprio agendamento (novo horário), sem criar registro novo e sem status "reagendada".
- Texto do modal explica: para outro dia, use "Agendar" ou clique no horário desejado no Calendário.

### 2.2 Novo dia → sempre pelo "Agendar" / clique no Calendário
Ao criar um agendamento para um lead (mesmo telefone) que já tem reunião **"Agendada"** ou **"Confirmada"** em outra data/horário, o sistema calcula quanto tempo falta para essa reunião existente (fuso America/Sao_Paulo):

| Tempo restante para a reunião antiga | O que o sistema faz |
|---|---|
| **Menos de 60 min** (ou já passou do horário) | Mantém a reunião antiga na data dela com status **Reagendada** e cria a nova reunião na nova data como **Agendada** |
| **60 min ou mais** | **Exclui** a reunião antiga (exclusão lógica, com justificativa automática "reagendado para nova data") e cria apenas a nova reunião como **Agendada** |

### 2.3 Confirmação para o usuário
Antes de gravar, aparece um aviso do tipo:

> Este lead já tem reunião em 26/08 às 15:00 (Confirmada). Faltam mais de 1h — a reunião antiga será excluída e substituída por esta nova. [Continuar] [Cancelar]

ou, no caso de menos de 1h:

> Faltam menos de 1h para a reunião de hoje às 19:00 — ela ficará como Reagendada e esta nova será criada. [Continuar] [Cancelar]

## 3. Efeitos nas métricas e integrações

- Como a reunião antiga é excluída no caso ">= 60 min", o vínculo de reagendamento deixa de existir → a nova agenda conta como **agenda nova** na produção do SDR.
- No caso "< 60 min", a antiga fica "Reagendada" e a nova nasce vinculada a ela → **não** conta como agenda nova (é remanejo de última hora).
- Webhooks para o CRM: a antiga dispara "Reagendada" (caso < 60min) ou "Excluída" (caso >= 60min); a nova dispara "Agendado" quando o Closer for atribuído. Mesmo padrão de payload atual, sem novos formatos.
- Google Calendar: o evento da reunião excluída/reagendada é removido da agenda do Closer, como já ocorre hoje em exclusão/cancelamento.

## 4. Pontos que preciso que você valide

1. **Exclusão automática** da reunião antiga (>= 60 min): confirma que pode ser automática, ou prefere que o sistema apenas **cancele** a antiga (mantendo no histórico como "Cancelada") em vez de excluir?
2. **Reunião antiga já passada** (horário venceu, ainda "Agendada"/"Confirmada"): trato como "< 60 min" (vira "Reagendada")? Ou deve seguir o fluxo normal de no-show/cancelamento antes?
3. **Nova data igual à data da antiga** criada pelo Calendário (mesmo dia, outro horário): trato como troca de horário no próprio registro (igual ao "Reagendar"), sem duplicar. Confirma?
4. **Quem pode disparar isso**: SDR, Moderador, Gestor e Supervisor — todos com a mesma regra? Ou o aviso/decisão fica só para Gestor/Moderador?
5. **Janela de detecção**: hoje o gatilho olha reuniões dos últimos 7 dias. Mantenho 7 dias ou considero qualquer reunião futura em aberto do mesmo telefone (sem limite)?

## 5. Detalhes técnicos (para referência)

- `src/pages/DashboardPage.tsx` — `handleReschedule` e o dialog "Reagendar": travar a data na `detailAg.scheduled_date`, remover o caminho de insert com `original_agendamento_id`.
- `src/pages/AgendarPage.tsx` — no submit de criação, buscar reunião existente do mesmo telefone com status `agendada`/`confirmada`; calcular diferença até `scheduled_date + scheduled_time` em BRT (`src/lib/timezone.ts`); aplicar exclusão lógica (`deleted_at`, `deleted_by`, `deletion_reason`) ou vínculo `original_agendamento_id` conforme a regra.
- Fluxo de clique no horário do Calendário usa a mesma função de criação, então herda a regra.
- Gatilho `public.detect_and_mark_reschedule()`: ajustar para não vincular automaticamente quando o front já decidiu (evitar dupla marcação) — o vínculo passa a ser explícito.
- Sem alteração nas colunas do Ranking de SDRs (as colunas "Reagend."/"Total geração" seguem descartadas).
