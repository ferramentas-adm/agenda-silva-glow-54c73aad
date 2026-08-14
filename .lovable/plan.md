# Erro ao atualizar venda (supervisora/moderadora)

## O que aconteceu

Quando o gestor/moderador abre "Registrar / atualizar venda" em uma reunião que **já tem registro de venda criado pelo Closer**, o app grava com `upsert`. O banco tenta primeiro o caminho de *inserção*, e a regra de acesso de inserção da tabela `vendas` exige que o campo "criado por" seja o próprio usuário logado. Como o modal reenvia o "criado por" original (o Closer), a inserção é bloqueada e aparece a mensagem "new row violates row-level security policy for table vendas".

Verificado: Amanda Alencar tem função **moderador**, que já é reconhecida como gestora pelas regras de acesso — o problema não é a permissão dela, é o campo "criado por" enviado no upsert.

## Correção

No modal do gestor, separar os dois casos em vez de usar upsert:

- Se já existe registro de venda para a reunião → fazer apenas **atualização** (a regra de atualização permite gestores/moderadores/supervisores).
- Se não existe → fazer **inserção** com "criado por" = usuário logado.

A remoção da venda continua igual (já é atualização).

## Detalhes técnicos

- `src/components/dashboard/GestorVendaDialog.tsx`: em `handleSubmit`, trocar o `supabase.from("vendas").upsert(..., { onConflict: "agendamento_id" })` por:
  - `existing` presente: `.update({ vendeu: true, valor, produto, venda_origem, closed_at, status_antes_venda }).eq("agendamento_id", agendamentoId)` — sem tocar em `created_by`, `lead_revenue` e `vendeu_closer`.
  - `existing` ausente: `.insert({ agendamento_id, ..., created_by: user.id })`.
- Nenhuma migração de banco necessária; as políticas de `vendas` ficam como estão.
