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

## Validação

- SDR com reunião de ontem: vê a trava, marca "Não compareceu" com motivo, recebe o pop-up de novo agendamento, e a trava libera.
- SDR encaminha ao closer: sai da trava dele e entra na do closer; o closer devolve e volta para o SDR.
- Criador = closer: etapa única com todas as ações.
- Gestor não é travado e consegue enviar a reunião para outro closer.
- Nenhuma tela preta ao resolver a última pendência; nenhum pop-up atrás da trava.
- Motivo aparece na lista de reuniões, no filtro e no gráfico de motivos.
