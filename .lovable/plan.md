## Objetivo

Produzir um prompt em português, completo e pronto para uso em assistentes de IA (ex.: Claude, GPT-4, Cursor, Lovable), que descreva os cards de métricas da barra de status do calendário (`/dashboard`) e permita regenerar ou manter o código equivalente.

## Entregável

1. **Prompt em português** salvo como arquivo de texto/markdown no projeto (`prompts/cards-metricas-calendario.md` ou similar) e também apresentado na conversa.
2. O prompt conterá:
   - **Contexto do projeto**: React + TypeScript + Tailwind + shadcn/ui, tema dark/light, sidebar sempre dark, timezone America/Sao_Paulo.
   - **Localização**: os cards ficam em `src/pages/DashboardPage.tsx`, dentro do bloco `Status counters`, acima do título "Calendário".
   - **Visões**: visão não-closer (gestor/moderador/sdr/supervisor) com 12 cards no desktop (`xl:grid-cols-12`) e visão closer com 9 cards (`xl:grid-cols-9`).
   - **Lista completa dos cards** com:
     - nome/rótulo;
     - ícone (Lucide);
     - cor do ícone e background;
     - regra de cálculo (baseada nos status dos agendamentos do dia selecionado, filtrados pelos closers selecionados);
     - comportamento de click (apenas "Total agend. dia" abre drilldown por canal).
   - **Regras de classificação SDR vs 2ª reunião**:
     - SDR: `created_by` com role `sdr` no `userRolesMap` OU `sdr_responsavel_id` preenchido.
     - 2ª reunião: `created_by` com role `closer` OU `meeting_reason === "segunda_reuniao"`.
   - **Cálculos principais**:
     - `totalSdrCount`: agendamentos SDR com status em `TOTAL_STATUSES`.
     - `closerCreatedCount`: agendamentos de 2ª reunião com status em `TOTAL_STATUSES`.
     - `closerRealizadaCount`: agendamentos de 2ª reunião com status `realizada`.
     - `totalAgend` (não-closer): `totalSdrCount + closerCreatedCount`.
     - `aindaReal`: `agendada + confirmada`.
     - `nao_comparecimento`: `cancelada + no_show + reagendada`.
     - `reagendada`: status `reagendada` OU `original_agendamento_id` preenchido.
   - **Estilo visual**: cards arredondados (`rounded-xl`), borda sutil (`border-primary/10`), padding compacto (`p-2`), tipografia em 2 linhas (número em `text-lg font-bold` e rótulo em `text-[10px] text-muted-foreground`), layout responsivo (`grid-cols-2 sm:grid-cols-4`).
   - **Constraints**: não hardcodear cores hex; usar tokens Tailwind (`text-sky-300`, `bg-sky-500/10`, `text-primary`, `bg-primary/10`, etc.); não alterar regras de cálculo fora do escopo; não adicionar backend; manter TypeScript tipado.

## Fora do escopo

- Não gerar o código agora (apenas o prompt).
- Não alterar `DashboardPage.tsx` nem outros arquivos.
- Não incluir lógica de drilldown além do já existente no card "Total agend. dia".

## Validação

- Revisar o prompt para garantir que todas as 12 métricas da imagem de referência estejam cobertas.
- Verificar se as cores e ícones descritos correspondem ao screenshot fornecido.
- Garantir que o prompt instrua a IA a preservar a visão de closer (9 cards) e a visão geral (12 cards).