# Bloqueio em Massa (somente Gestor)

Novo módulo para o gestor bloquear a agenda de vários closers ao mesmo tempo (treinamento, comunicado, feedback etc.), replicando as telas de referência enviadas.

## Acesso

- Item novo no menu lateral, "Bloqueio em massa" (ícone de usuários/calendário), logo acima de "Admin".
- Visível e acessível **apenas para a função Gestor**. Quem não é gestor e tentar abrir a rota direto é redirecionado para o calendário.
- O banco já permite que o gestor crie e apague bloqueios de qualquer closer, então nenhuma mudança de permissão de dados é necessária.

## Tela

Layout em duas colunas (como nos prints):

**Coluna esquerda — Closers ativos**
- Contador de closers ativos e botão "Selecionar todos" / "Limpar seleção".
- Lista rolável com nome + e-mail e seleção múltipla (checkbox/círculo).
- Campo de busca por nome para listas grandes.

**Coluna direita — Configuração do bloqueio**
- Abas "Pontual" (data única) e "Recorrente" (dias da semana Dom–Sáb, múltipla escolha).
- Motivo (select), Início e Fim (horário), Descrição opcional.
- Rodapé com resumo da seleção ("Nenhum closer selecionado" / "N closers selecionados") e botão "Bloquear agenda", desabilitado até haver closers + data/dias + motivo válidos.
- Validações: fim depois do início, data não retroativa, motivo obrigatório, ao menos 1 closer.
- Ao concluir: toast com o total de bloqueios criados (closers × dias) e limpeza do formulário.

**Bloqueios recentes** (card abaixo)
- Lista dos bloqueios futuros e recorrentes de todos os closers: nome do closer, motivo, data e horário (ou selo "Toda Terça" quando recorrente) e botão de excluir por linha.

## Motivos

Comunicado, Feedback coletivo, Feedback individual, Reunião interna, Treinamento e **Bloqueio pessoal** — somando-se aos motivos já cadastrados nas configurações, sem duplicar.

## Detalhes técnicos

- Nova página `src/pages/BloqueioMassaPage.tsx` + rota `/bloqueio-massa` em `src/App.tsx` dentro de `ProtectedRoute`, com guarda por `role === "gestor"`.
- Item de menu em `src/components/AppLayout.tsx` condicionado a `isGestor`.
- Escrita em lote na tabela `closer_blocks` (um registro por closer × data, ou por closer × dia da semana com `is_recurring` + `recurrence_weekday`), reaproveitando o mesmo formato usado por `CloserBlockDialog`.
- Invalidação das queries `closer-blocks`, `closer-blocks-day`, `closer-blocks-slots` e `closers-availability` para o calendário e o seletor de horários refletirem os bloqueios imediatamente.
- Motivos vindos de `useAppSettingList(APP_SETTING_KEYS.block_reasons)` com os defaults do módulo (incluindo "Bloqueio pessoal") mesclados.
- Somente tokens do design system (sem cores fixas), seguindo o padrão escuro das telas atuais.
