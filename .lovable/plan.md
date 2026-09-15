# Lead desqualificado: aviso + bloqueio em vez de limpar a tela

## O que está acontecendo (confirmado no código)

O interruptor **Lead desqualificado** fica na última etapa (Confirmar agendamento), que só é desenhada quando existem lead, data **e** horário. Ao ligar o interruptor, um efeito limpa de propósito o closer e o horário (`setCloserId(null); setTime(null)`) — sem horário, a etapa de confirmação não tem o que mostrar e a tela fica em branco, parecendo travada.

## Decisão

Não limpar mais nada automaticamente. Em vez disso: avisar e **bloquear a confirmação** quando a combinação for proibida.

## O que será feito

1. **Remover o efeito que limpa closer e horário** ao ligar/desligar o interruptor (causa da tela em branco). A escolha feita pelo usuário é preservada.
2. **Aviso + bloqueio na confirmação**: quando o interruptor "Lead desqualificado" estiver ligado e o closer escolhido for da **Turma A** (closer normal), aparece um aviso em destaque:
   > "Lead desqualificado não pode ser alocado com closer da Turma A. Volte e escolha um closer da Turma B (em treinamento) ou deixe o closer como 'A definir' (fila de atribuição)."
   
   Enquanto o aviso estiver ativo, o botão de confirmar o agendamento fica **desabilitado** — não dá para gravar a combinação proibida.
3. **Caso simétrico**: se o interruptor estiver desligado e o closer for da **Turma B**, o mesmo aviso/bloqueio se aplica (a trava do banco já recusa essa combinação hoje; o aviso evita o erro seco no momento de salvar). Sem custo extra, mesma verificação.
4. **Nada muda para quem não vê o interruptor** (SDR/closer): o fluxo deles continua igual — eles não escolhem o flag, e a trava do banco (`enforce_desqualificado_closer_treinamento`) segue como última linha de defesa.
5. Sem migração, sem mudança em API, RLS, edge functions, calendário ou métricas.

## Detalhes técnicos

- `src/pages/AgendarPage.tsx`:
  - remover o `useEffect` das linhas ~201-204 (o que limpa `closerId`/`time` ao trocar `leadDesqualificado`);
  - na query `closers-active` (linha ~212), incluir `em_treinamento` no select para saber a turma do closer escolhido;
  - na etapa `confirm`, derivar `incompativel = closerId && closerSelecionado.em_treinamento !== leadDesqualificado`; quando verdadeiro, renderizar o aviso (Alert vermelho) e desabilitar o botão de confirmar;
  - o interruptor continua na etapa de confirmação, visível só para gestor/moderador (`isAdmin`), com o texto atual.
- `CloserSelector`/`TimeSlotPicker` continuam recebendo `treinamento={leadDesqualificado}` (se o usuário voltar às etapas anteriores com o interruptor ligado, a lista já mostra só a turma certa).

## Validação

- Ligar o interruptor com um closer da Turma A escolhido: tela permanece, aviso aparece, botão de confirmar desabilitado; desligar o interruptor libera o botão.
- Ligar o interruptor sem closer (fila de atribuição): sem aviso, confirmação liberada.
- Concluir um agendamento desqualificado com closer da Turma B: grava normalmente.
- `git diff --check` e build ao final.
