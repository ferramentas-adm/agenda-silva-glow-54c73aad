# Mesmo erro de RLS ao atualizar venda (lead Miguel — Igor Occon)

## Por que aconteceu

Ontem o erro foi corrigido só no modal do gestor ("Lançar venda"). Restou o **mesmo padrão errado** no modal de resultado da reunião (`VendaDialog`), que é o que a supervisora usou nesta agenda.

Confirmado no banco: a venda do lead **Miguel (14/08)** já existe e o campo "criado por" é do **Igor Occon** (o closer). O modal de resultado grava com `upsert`, e o banco valida a regra de *inserção* mesmo quando o registro já existe — essa regra exige "criado por" = usuário logado. Como o modal reenvia o "criado por" original (Igor), a gravação é bloqueada com "new row violates row-level security policy for table vendas".

A função de acesso do banco já reconhece **supervisor** como gestor, então não é falta de permissão da Amanda.

## Correção

No modal de resultado da reunião, separar os dois casos (igual ao que já foi feito no modal do gestor):

- Registro já existe → apenas **atualizar**, sem tocar em "criado por".
- Não existe → **inserir** com "criado por" = usuário logado.

Assim qualquer gestor/moderador/supervisor pode atualizar o resultado de uma reunião registrada pelo closer.

## Detalhes técnicos

- `src/components/VendaDialog.tsx` (`handleSubmit`, linhas ~108-121): substituir o `supabase.from("vendas").upsert({...}, { onConflict: "agendamento_id" })` por:
  - `existing` presente: `.update({ vendeu_closer, lead_revenue, motivo_nao_fechamento, observacoes }).eq("agendamento_id", agendamentoId)` — sem enviar `created_by` nem `vendeu`.
  - `existing` ausente: `.insert({ agendamento_id, vendeu: false, vendeu_closer, lead_revenue, motivo_nao_fechamento, observacoes, created_by: user.id })`.
- Nenhuma alteração de banco/políticas.
