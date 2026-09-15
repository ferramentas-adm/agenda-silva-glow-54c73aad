# Corrigir a tela que "some" ao ligar Lead desqualificado

## O que está acontecendo (confirmado no código)

O interruptor **Lead desqualificado** está na última etapa (Confirmar agendamento). Essa etapa só é desenhada quando existem lead, data **e** horário escolhidos.

Ao ligar o interruptor, o app limpa de propósito o closer e o horário (para não deixar um lead desqualificado com closer da Turma A). Como o horário deixa de existir, a etapa de confirmação não tem mais o que mostrar — e a tela fica em branco, com os botões parados. É exatamente o "trava e some" relatado.

## O que será feito

1. **Mover o interruptor para o começo do fluxo**, antes de escolher o closer e o horário: assim a escolha de turma já orienta a lista de closers e a contagem de horários livres, e nada precisa ser apagado depois.
   - Etapa "Selecionar Closer" para gestor/moderador (e etapa "Data e Horário" para quem não escolhe closer), com o mesmo texto atual: "Lead desqualificado — Só pode ser alocado com closer em treinamento (Turma B)".
2. **Nunca deixar a tela vazia**: se o interruptor mudar e o horário/closer for limpo, o app volta automaticamente para a etapa de escolha de closer (ou de data/horário), em vez de ficar numa etapa sem conteúdo.
3. **Manter o resumo na confirmação**: na etapa final, o estado do lead (Qualificado / Desqualificado) aparece como linha de resumo somente leitura, junto de Lead, Closer, Data e Horário.
4. **Não limpar nada na abertura**: em reagendamento, quando o valor vem do agendamento original, o closer e o horário herdados não são apagados.

## Validação ponta a ponta

Teste no navegador, dentro do app, com uma conta de gestor:
- Ligar e desligar o interruptor várias vezes e conferir que a tela nunca fica em branco.
- Com o interruptor ligado, conferir que a lista mostra só closers da Turma B e que os horários livres correspondem a eles.
- Com ele desligado, conferir que só aparecem closers da Turma A.
- Concluir um agendamento com lead desqualificado + closer da Turma B e conferir que gravou certo.
- Tentar o cruzamento proibido (desqualificado com Turma A) e conferir o aviso amigável em vez de erro.

Para esse teste eu preciso entrar no app com uma conta; vou pedir aprovação para usar uma sessão de teste na hora de rodar.

## Detalhes técnicos

- `src/pages/AgendarPage.tsx`:
  - extrair o bloco do `Switch` (linhas ~914-927) para um pequeno componente interno e renderizá-lo na etapa `closer` (ou `datetime` quando `!canPickCloser`), mantendo a guarda `isAdmin`;
  - o `useEffect` de `leadDesqualificado` (linhas ~201-204) passa a ignorar o primeiro render (ref de inicialização, evitando limpar dados herdados de `editData`) e, quando limpar `closerId`/`time`, também faz `setStep(canPickCloser ? "closer" : "datetime")`;
  - adicionar `SummaryRow label="Lead" value="Qualificado | Desqualificado (Turma B)"` na etapa `confirm`.
- Sem mudança em `CloserSelector`, `TimeSlotPicker`, `useSlotCounts`, migração, RLS ou edge functions — a trava do banco (`enforce_desqualificado_closer_treinamento`) continua igual.
