# Prompt de exportação: trava de atualização de status + "Não compareceu"

Cole o texto abaixo no outro projeto (Grupo VR). Ele substitui os botões antigos "No-show" e "Cancelar" por um fluxo único "Não compareceu" e replica a trava de reuniões vencidas com todas as correções já feitas aqui.

---

## Contexto

No projeto atual ainda existem os botões antigos **No-show** e **Cancelar** para encerrar uma reunião. Preciso migrar para o fluxo novo, já validado em produção em outro painel: um único botão **Não compareceu** com motivo obrigatório, mais uma **trava de tela** que obriga o SDR/Closer a atualizar reuniões vencidas.

Antes de codar: leia os componentes atuais de detalhes/calendário/lista de reuniões e o schema da tabela `agendamentos`, liste as divergências em relação à especificação abaixo e o que pretende alterar. **Não invente colunas** — adapte aos nomes existentes. Nenhuma alteração estrutural de schema deve ser necessária (só reuso de `status`, `cancellation_reason` e campos de handoff; se algum campo de handoff não existir, aí sim crie por migration aditiva).

## Parte 1 — Fim de "No-show" e "Cancelar": um único "Não compareceu"

- Remover os botões separados de No-show e Cancelar em **todos** os pontos: detalhes da reunião, calendário, lista de reuniões, banner de pendências e trava.
- Um único botão **Não compareceu**, que abre um diálogo com **motivo obrigatório** em lista suspensa.
- Motivos editáveis pelo Admin (lista guardada em `app_settings`, chave `no_show_reasons`), com padrões: "No-show", "Cancelou por imprevisto pessoal", "Cancelou por desistência", "Sem closer disponível", "Alterou horário para o mesmo dia".
- Ao confirmar: grava `status = 'no_show'` e `cancellation_reason = motivo`. Sem motivo, o botão de confirmar fica bloqueado.
- Não existe mais "reagendamento": remover a ação e o estado morto correspondente. Em vez disso, ao gravar "Não compareceu" abre um pop-up **"Agendar novamente?"** que leva à tela de agendar com os dados do lead pré-preenchidos por querystring (nome, telefone, e-mail, closer, canal, motivo da reunião).
- Excluir reunião passa a ser exclusivo de gestor/supervisor/moderador (SDR não exclui).
- O motivo escolhido deve ser enviado junto no payload para o CRM/webhook de status.
- Motivos classificados para relatório (no-show real vs. cancelamento vs. troca de horário), para alimentar o gráfico de motivos.
- Rótulos e textos em toda a interface: "Não compareceu" — nada de "No-show"/"Cancelar"/"Reagendar".

### Migração do histórico (obrigatória)

Todo o histórico do painel precisa ser convertido para a nova base, sem perder nada:

- Reuniões que estavam marcadas com o botão antigo **No-show** → passam a "Não compareceu" com motivo **"No-show"**.
- Reuniões que estavam marcadas com o botão antigo **Cancelar** (`status = 'cancelada'`) → passam a "Não compareceu" com motivo **"Cancelou por imprevisto pessoal"**, e o `status` vira `no_show`.
- Aplicar em **todo o histórico**, desde o início do painel, sem filtro de data.
- Só preencher o motivo quando estiver vazio: registros que já têm `cancellation_reason` são preservados como estão.
- Fazer isso como atualização de dados única (não schema), em duas instruções:

```sql
UPDATE agendamentos SET cancellation_reason = 'No-show'
 WHERE status = 'no_show' AND (cancellation_reason IS NULL OR btrim(cancellation_reason) = '');

UPDATE agendamentos SET cancellation_reason = 'Cancelou por imprevisto pessoal', status = 'no_show'
 WHERE status = 'cancelada';
```

- Antes de rodar, contar quantos registros caem em cada caso e reportar; depois, conferir que não sobrou nenhum `status = 'cancelada'` nem `no_show` sem motivo.
- A classificação para relatórios deve continuar tratando `cancelada` (registros antigos, caso apareçam de integrações) como cancelamento, para não quebrar gráficos históricos.

## Parte 2 — Trava de reuniões vencidas (últimas atualizações e correções)

**Quem é travado e quando**
- Só reuniões ativas (`agendada`, `confirmada`, `nao_confirmada`), `deleted_at IS NULL`, com `scheduled_date <= hoje` (BRT) e já passadas do horário + **65 minutos** de tolerância.
- `pendente` (aguardando atribuição) não trava ninguém — atribuir closer é responsabilidade do gestor.
- Gestor/supervisor/moderador/apresentador nunca são travados.
- O horário da reunião é wall-time em America/Sao_Paulo: converta para instante real antes de comparar com "agora" (não usar `new Date(date + " " + time)` direto).

**Fluxo em etapas (nunca as duas ao mesmo tempo)**
1. **SDR** (criador ou responsável) é travado primeiro: "Não compareceu" ou "Enviar para o closer" (`sdr_handoff_at = now()`).
2. Após o encaminhamento a trava passa para o **Closer**: "Realizada" ou "Não fui eu que atendi" (devolve ao SDR gravando `closer_returned_at` + `closer_return_reason`).
3. Devolvida, a trava volta ao SDR — e nesse caso o botão "Enviar para o closer" fica oculto.
4. Quando o criador é também o closer da reunião não há handoff: etapa única, todas as ações juntas.

**Ação "Definir closer que atendeu"** — só gestor, supervisor e moderador de SDR. Como a reunião **já aconteceu**, essa ação serve apenas para transferir a responsabilidade de registro do resultado: lista os closers ativos, troca o `closer_id`, coloca a reunião na etapa do closer (`sdr_handoff_at`/`closer_handoff_at = now()`) e limpa `closer_returned_at`/`closer_return_reason`. **Nenhuma chamada ao Google Calendar e nenhum link de Meet novo** — o `meet_link` e o `google_event_id` originais são preservados como histórico. Registrar em auditoria (quem transferiu, de qual closer para qual) e notificar o novo closer. Ao CRM vai um novo payload com os mesmos dados do agendamento, mudando apenas o nome/id do closer. Caso de uso: o closer original ficou preso em outra call e outro atendeu.

**Correções já aplicadas — repita todas**
- **Tela preta:** todos os hooks (inclusive queries condicionais, como a lista de closers) precisam ficar **antes** de qualquer `return null`. Hook depois do early-return muda a ordem de hooks quando a contagem sai de 0 e derruba a árvore. Envolva a área em um ErrorBoundary.
- **Pop-up de novo agendamento sumindo:** os diálogos ("Não compareceu" e "Agendar novamente?") ficam **sempre montados**; só o painel da trava é condicional (`count > 0`). Assim o pop-up sobrevive ao instante em que a última pendência é resolvida.
- **Pop-ups atrás da trava:** a trava fica em `z-[100]`; suba overlay/conteúdo de Dialog e AlertDialog para `z-[120]`/`z-[130]`, `SelectContent` para `z-[140]+`, e o painel lateral de briefing (`Sheet`) para `z-[140]`/`z-[150]` — senão ele aparece esmaecido e sem clique por cima do modal de detalhes.
- **Cartão fantasma:** após gravar o status, além de invalidar (`overdue-meetings`, `agendamentos`, `pending-meetings`, `pending-assignments`), fazer `refetchQueries(["agendamentos", scheduled_date])`.
- **Falso sucesso por RLS:** o update usa `.select("id")`; se voltar vazio, mostrar erro de permissão em vez de "salvo com sucesso".
- **Botão "Confirmar" do SDR:** manter o SDR podendo confirmar a reunião.
- **Reverter status por engano:** exige justificativa registrada em auditoria.
- **Carga:** `refetchInterval` de 5 min + refetch em `visibilitychange` + realtime filtrado no próprio usuário (`closer_id`, `created_by`, `sdr_responsavel_id`) com debounce de 1,5 s. Nomes de closer/SDR resolvidos em lote (2 queries), nunca por linha.
- **Telas liberadas durante a trava:** apenas as necessárias para resolver (detalhe da venda e detalhe do lead).

## Payload de status para o CRM — mesmo formato, status derivado do motivo

- O **formato do payload não muda**: mesmas chaves, mesma estrutura, mesmo webhook/trigger de mudança de status. O CRM continua recebendo os mesmos rótulos de status que já conhece ("No-show" e "Cancelar").
- O status enviado passa a ser **derivado do motivo** escolhido em "Não compareceu" (o banco guarda sempre `status = 'no_show'` + `cancellation_reason`):
  - Motivo "No-show" → envia status **"No-show"**.
  - Qualquer outro motivo ("Cancelou por imprevisto pessoal", "Cancelou por desistência", "Sem closer disponível", "Alterou horário para o mesmo dia", e motivos personalizados de cancelamento) → envia status **"Cancelar"**.
- Essa tradução tem que existir nos dois caminhos de envio: no trigger/webhook do banco e no helper de reenvio do frontend. O motivo em si também vai no payload.
- A ação "Definir closer que atendeu" dispara um novo payload com os mesmos dados, mudando apenas o closer (com um indicador de tipo de evento, ex.: `evento: "closer_atualizado"`), sem alterar as demais chaves.

## Parte 3 — Aba "Não comparecimento" no Dashboard

Nova aba no Dashboard Comercial, alimentada pelos motivos gravados:

- Cabeçalho com o período, alternância **Data da reunião / Data de criação**, filtro **por SDR** (todos os SDRs, incluindo overrides) e indicação de "atualizado agora".
- Quatro cartões de resumo: **Total não comparecimento**, **Contabilizado como Cancelado**, **Contabilizado como No-show** e **Não contabilizado (novo horário no mesmo dia)**.
- Gráfico de rosca com a distribuição por motivo + legenda lateral clicável com contagem e percentual de cada motivo, ordenada da maior para a menor.
- Clique em uma fatia ou na legenda abre o detalhamento com os leads (nome, telefone, data/hora, SDR e selo do status).
- Regra de classificação (arquivo próprio, reaproveitado nas métricas): "No-show" conta como no-show; "Cancelou por desistência", "Cancelou por imprevisto pessoal" e "Sem closer disponível" contam como cancelamento; "Alterou horário para o mesmo dia" é **ignorado** quando existe outra reunião ativa para o mesmo lead no mesmo dia (senão conta como cancelamento); registros antigos sem motivo caem pelo status; motivos personalizados contam como no-show.
- A consulta busca `status in ('no_show','cancelada')`, ignora excluídos e resolve nomes de SDR em lote.

## Validação

- SDR com reunião de ontem: vê a trava, marca "Não compareceu" com motivo, recebe o pop-up de novo agendamento, e a trava libera.
- SDR encaminha ao closer: sai da trava dele e entra na do closer; o closer devolve e volta para o SDR.
- Criador = closer: etapa única com todas as ações.
- Gestor não é travado e consegue enviar a reunião para outro closer.
- Nenhuma tela preta ao resolver a última pendência; nenhum pop-up atrás da trava.
- Motivo aparece na lista de reuniões, no filtro e no gráfico de motivos.
