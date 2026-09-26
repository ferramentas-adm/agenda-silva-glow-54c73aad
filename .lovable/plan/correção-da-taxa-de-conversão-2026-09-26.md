# Correção da Taxa de Conversão

## Regra correta (confirmada pelo usuário)
A Taxa de Conversão conta **somente reuniões com leads qualificados** — não importa se o closer era Turma A ou B no momento da reunião. Se um closer da Turma B atendeu um lead qualificado, aquela reunião (e a venda, se houver) entra normalmente na taxa. Leads desqualificados só entram quando geraram venda paga (regra já existente).

## O que mudar

### 1. Reverter o filtro por turma do closer
- Na função `dashboard_conversao_period`, **remover** o filtro `AND a.closer_turma = 'A'` adicionado na migração `agendamento_closer_turma_conversao`.
- A contagem volta a ser baseada no lead: exclui `lead_desqualificado = true`, exceto quando há venda com `valor > 0` (comportamento anterior, que já estava correto).

### 2. Manter a coluna `closer_turma`
- A coluna `agendamentos.closer_turma` e o trigger que congela a turma no momento da reunião **permanecem** — são úteis para relatórios futuros e não afetam a taxa.
- Nenhuma outra regra muda (capacidade, horários, bloqueios, redistribuição A→B).

## Validação
- Conferir no banco que o total de reuniões realizadas de hoje volta a bater com a contagem por lead qualificado (incluindo as 3 reuniões de closers Turma B com leads qualificados: 2 do Bruno Casari, 1 do Lucca).
- Teste no navegador do card Taxa de Conversão no Dashboard Comercial.

## Detalhes técnicos
- Migração nova: recriar `dashboard_conversao_period` sem o filtro de turma (assinatura inalterada).
- Arquivos: apenas a migração SQL; nenhum código de tela muda.
