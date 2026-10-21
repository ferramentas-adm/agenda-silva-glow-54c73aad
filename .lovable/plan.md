# Automação da aba Follow-ups com o Datacrazy (Régua D1–D14)

## Objetivo
Ler as conversas de WhatsApp dos closers no Datacrazy e, para cada follow-up ativo:
- lead respondeu / combinou horário → IA ajusta data/hora (ou marca "data a confirmar");
- closer mandou a mensagem certa do dia e o lead não respondeu → empurra para o próximo dia útil;
- closer não mandou ou mandou fora do modelo → não mexe na data; registra "fora do processo" e entra no resumo diário.

O formulário "Registrar contato", o contador x/10 e a justificativa de 100 caracteres continuam iguais.

## Fluxo

```text
cron a cada 15 min (08h–20h BRT, seg–sex)
  -> followup-datacrazy-sync (lote limitado, lock)
       para cada venda ativa (follow_up_status='ativo'):
         achar a conversa (cache) -> ler mensagens novas -> IA classifica
         -> ação: reagendar | data_a_confirmar | avançar_dia | fora_processo | nada
cron diário 19h BRT
  -> followup-datacrazy-fechamento
       fecha o dia: quem não teve mensagem do closer = "sem mensagem"
       gera resumo por closer
```

## Tabelas novas

1. `followup_regua_estado` (uma linha por venda)
   - `venda_id` (PK), `dia_regua` (1–14), `regua_iniciada_em` (data)
   - `conversation_id`, `instance_id`, `conversa_localizada_em`
   - `ultima_msg_id_processada`, `ultima_msg_em`
   - `ultima_acao_data` (data BRT), `ultima_acao`; trava contra dois reagendamentos no mesmo dia
   - `data_a_confirmar` (bool), `data_a_confirmar_motivo`, `saiu_da_regua_em`, `saiu_motivo`
2. `followup_regua_eventos`: registro de cada decisão
   - `venda_id`, `run_id`, `tipo` (reagendado / data_a_confirmar / avancou_dia / fora_processo / lead_respondeu)
   - `motivo` (sem_mensagem / fora_do_modelo / baixa_confianca), `dia_regua`
   - `data_anterior`, `hora_anterior`, `data_nova`, `hora_nova`
   - `trecho_chat`, `confianca`, `ia_json`, `dry_run`, `aplicado`
   - Chave única `(venda_id, dia_ref, tipo)` para não repetir a mesma decisão.
3. `followup_regua_runs`: log de execuções, no mesmo padrão de `threec_runs` / `crm_daily_runs`
   - `kind` (sync / fechamento / manual), `status`, `lease_until`, contadores (processados, reagendados, avançados, fora, erros, 429)
   - `dry_run`, `error`, `paused_reason`
4. `followup_regua_resumo_diario`
   - `data`, `closer_id`, `total_fora`, `itens` (jsonb com lead, motivo, dia da régua e link)
5. Configuração em `app_settings`: ligado/desligado, `dry_run` (padrão ligado), allowlist de venda_ids/closers para piloto, janela de horário, tamanho do lote, limiar de confiança.

As tabelas ficam com leitura só para gestor/admin e escrita só pelo backend (service role). Os GRANTs e as regras de acesso entram na mesma migração.

## Funções no backend (edge functions)

- `_shared/datacrazyConversas.ts`: extrai de `datacrazy-conversas` a regra de casar telefone (DDD + últimos 8 dígitos, variações com e sem o 9). A função atual continua igual para a bolinha vermelha.
- `followup-datacrazy-sync`, executado a cada 15 min:
  1. Pega o lock em `followup_regua_runs` e confere se o job está pausado.
  2. Pega no máximo 25 vendas ativas por rodada, com `follow_up_date <= hoje`, ordenadas pela última checagem.
  3. Localiza a conversa uma única vez e grava o resultado.
  4. Lê as mensagens novas (`/conversations/{id}/messages`, take=50, paginando até a última já processada).
  5. Chama a IA só quando há mensagem nova. Sem mensagem nova, nada acontece até o fechamento.
  6. Aplica a ação: atualiza `vendas.follow_up_date/time`, grava o evento e a auditoria (`audit_logs`, entity `venda`, com o trecho do chat).
- `followup-datacrazy-fechamento`, às 19h BRT, em dias úteis:
  - follow-up de hoje sem mensagem do closer → `fora_processo / sem_mensagem`;
  - grava o resumo diário por closer.
- Disparo manual pelo Admin: escolher venda(s), com simulação ou envio real.
- Agendamento: os dois horários são cadastrados no próprio banco, que chama as funções. A rodada de 15 min só roda das 08h às 20h em dias úteis (cerca de 48 execuções por dia); fora desse horário não roda nada.

## Múltiplos closers e instâncias

- `GET /api/v1/instances` uma vez por rodada (cache de 1 h), guardando o mapa instância → closer. O vínculo é feito pelo nome/telefone da instância, com campo `datacrazy_instance_id` opcional em `closers`, preenchido no Admin para ficar exato.
- A busca usa `/conversations?search=<telefone>` com as duas variantes do 9 e aceita resultado de qualquer instância.
- Prioridade: a instância do closer dono do follow-up (`follow_up_owner_closer_id` ou o closer da reunião). Sem ela, a conversa mais recente de outro closer. A do SDR fica só para identificar a resposta do lead.
- Se o lead aparece em mais de uma instância de closer, as mensagens são juntadas por data. A "mensagem do closer" vale só se veio da instância do dono.
- Conversa não encontrada → `fora_processo / sem_conversa` no fechamento, sem mexer na data.

## Como a IA decide

Modelo `openai/gpt-6-astra` pelo Lovable AI, com resposta em JSON de formato fixo:
`{ lead_respondeu, combinou_horario, data_iso, hora, closer_enviou_hoje, aderencia_dia (0–1), dia_detectado, motivo, trecho, confianca (0–1) }`

O prompt recebe: dia atual da régua, objetivo e modelo daquele dia, mensagens de hoje com remetente e hora, e a data de hoje em BRT.

Mensagem "correta" quando todos os pontos abaixo valem:
- enviada hoje (BRT), pela instância do dono, depois da última mensagem do lead;
- cumpre o objetivo do dia, não precisa ser texto literal. Exemplo: D3 pergunta o que travou; D4 fala do custo de não agir e propõe horário; D14 encerra deixando a porta aberta;
- áudio conta como enviado. Nos dias de áudio (D2, D12) vale com aderência presumida, porque sem transcrição não dá para avaliar o conteúdo. Transcrever áudio fica como evolução futura.
- `aderencia_dia >= 0,7` e `confianca >= 0,75`.

Limites de decisão:
- aderência ≥ 0,7 → avança para o próximo dia útil;
- aderência entre 0,4 e 0,7 → `fora_processo / fora_do_modelo` com nota "duvidoso" no resumo; a data não muda;
- aderência < 0,4 → `fora_do_modelo`.

Data combinada: só aplica com `confianca >= 0,85`, data futura dentro de 60 dias e hora válida. Caso contrário, marca `data_a_confirmar`.

Lead respondeu sem combinar horário → sai da régua (`saiu_da_regua_em`) e vai para `data_a_confirmar`, para o closer decidir.

Avançar o dia da régua segue a sequência D1→D2→…→D8→D10→D12→D14. A data do follow-up vai para o próximo dia útil (função `proximoDiaUtil`, reaproveitando a regra de `diasUteisDeAtraso`). Depois do D14 com breakup enviado, nada é feito sozinho; aparece no resumo "régua encerrada" para o closer mandar para a Lixeira manualmente.

## Proteções e convivência

- Só mexe em vendas com `follow_up_status='ativo'` e `vendeu=false`. A gravação confere o status de novo antes de alterar (`... where follow_up_status='ativo'`).
- Nunca muda `follow_up_status`, `follow_up_tentativas` nem a justificativa de tentativas.
- A virada das 03:01 (`expirar_follow_ups_para_balde`) continua igual. Como a automação mantém as datas em dia, ela deixa de empurrar quem está no processo. Quem está fora do processo continua sujeito à tolerância de 2 dias úteis, de propósito.
- No máximo 1 mudança de data por venda por dia (`ultima_acao_data`). Mensagens já processadas são ignoradas (`ultima_msg_id_processada`).
- Se o follow-up tem evento no Google Calendar (`follow_up_event_id`), ele é atualizado pela `followup-calendar-event`, que já existe, só no modo real.

## Limites da API do Datacrazy

- Envio em sequência, com no máximo 2 chamadas ao mesmo tempo e cerca de 300 ms entre elas.
- Resposta 429: respeita o `Retry-After` e tenta no máximo 2 vezes. Com 3 respostas 429 na mesma rodada, encerra e registra `paused_reason='rate_limit'`; volta na rodada seguinte.
- Custo estimado: cerca de 25 vendas × (1 lista + 1–2 mensagens) ≈ 75 chamadas a cada 15 min. A localização da conversa fica em cache, então isso só acontece na primeira vez.
- Antes de construir: medir o formato real de `/instances` e `/messages` (remetente, `fromMe`, tipo áudio/texto, data) com 2–3 conversas, numa chamada só de leitura.

## Erros da IA

- Respostas 402/403 pausam o job, com o motivo visível no Admin.
- Resposta 429 encerra a rodada.
- Recusa da IA ou JSON inválido → evento `data_a_confirmar`, sem nenhuma ação.

## Telas

- Página Follow-ups (gestor/admin): card "Fora do processo — hoje" com uma lista por closer (lead, dia da régua, motivo e link para a conversa), mais um seletor de data para ver dias anteriores. Sem selo e sem notificação.
- No item do follow-up: etiqueta "Data a confirmar" quando marcada, sumindo quando o closer salva uma nova data.
- Admin → nova seção "Régua Datacrazy": liga/desliga, simulação, piloto (closers/vendas), limiares, histórico de rodadas e eventos com o trecho do chat.

## Teste antes de ligar para todos

1. Fase 0, só leitura: rodar a localização das conversas em 5 vendas e conferir se acha a conversa certa e se identifica bem quem mandou cada mensagem.
2. Fase 1, simulação com piloto: 1 closer e 5–10 leads, por 3 dias úteis. Tudo vai para `followup_regua_eventos` com `dry_run=true, aplicado=false`, e o Admin mostra "o que faria". O gestor revisa cada decisão, buscando mais de 90% de acerto.
3. Fase 2, real com piloto: liga as alterações só para esse closer.
4. Fase 3: ampliar para 3 closers e depois para todos, com a simulação ligada por 1 dia a cada ampliação.
5. Testes automáticos para o próximo dia útil (sexta → segunda), a sequência da régua (D8→D10), os limiares de confiança, o bloqueio de dois reagendamentos no mesmo dia e o bloqueio para status diferente de 'ativo'.

## Riscos

- O Datacrazy pode não indicar claramente quem enviou a mensagem → validado na fase 0.
- Closer usando outro número, fora das instâncias, cai em "sem mensagem" (falso positivo) → o resumo deixa claro o motivo.
- Áudios não podem ser avaliados → aderência presumida e nota no resumo.
- A IA pode errar data relativa ("sexta" quando hoje é sexta) → data de hoje em BRT no prompt, limiar 0,85 e "data a confirmar" na dúvida.
- Custo da IA: chamada só quando há mensagem nova, cerca de 1–3 por lead por dia.
- Rate limit compartilhado com a bolinha vermelha e o proxy do CRM → lote pequeno e pausa automática.

## Pontos que assumi (corrija se for diferente)

- O dia da régua começa em D1 no primeiro dia útil depois da reunião não fechada e é guardado na nova tabela, sem depender do contador x/10.
- O resumo diário sai às 19h BRT, só em dias úteis.
- A conversa de referência é a da instância do closer dono do follow-up.
