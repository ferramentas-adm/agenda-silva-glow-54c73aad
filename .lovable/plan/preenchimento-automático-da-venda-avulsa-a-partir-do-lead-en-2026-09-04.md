# Preenchimento automático da venda avulsa a partir do lead encontrado

## O que muda para quem usa

Ao escolher um lead na busca do campo "Nome do cliente", o sistema passa a preencher automaticamente, além do telefone:

- Closer (o último que atendeu esse lead)
- SDR responsável
- Canal da venda

Cada sugestão da lista mostra, abaixo do nome e telefone, uma linha discreta com closer, SDR e canal, e a data da última reunião — assim o gestor já sabe qual registro está escolhendo quando o lead tem mais de um histórico.

Todos os campos preenchidos continuam editáveis: se o gestor quiser trocar closer, SDR ou canal, basta alterar normalmente. Quando o lead não tem um desses dados no histórico, o campo fica vazio como hoje.

Nada é preenchido automaticamente em produto, valores ou descrição — esses seguem manuais, porque variam a cada venda.

## Detalhes técnicos

Arquivo alterado: `src/components/dashboard/AvulsaSaleDialog.tsx` (somente frontend; nenhuma mudança de banco).

- A query `["avulsa-lead-search", termo]` passa a selecionar também `id, closer_id, sdr_responsavel_id, channel_type, scheduled_date` de `agendamentos` (ainda `deleted_at is null`, ordenado por `updated_at desc`, `limit 50`).
- A deduplicação atual (nome + dígitos do telefone) mantém o registro mais recente, que já é o que carrega closer/SDR/canal mais atuais.
- Nomes exibidos resolvidos no client com as listas já carregadas no dialog: `closers` (`id → name`) e `get_public_profiles` (`user_id → full_name`). Sem query extra.
- Ao selecionar a sugestão: além de `setLeadName`/`setLeadPhone`, aplica `setCloserId(closer_id ?? "")`, `setSdrId(sdr_responsavel_id ?? "none")` e `setChannelType` apenas se o valor existir e estiver na lista de canais válidos (`channelTypes`), evitando um Select com valor inválido.
- Limpar a seleção do lead ("lead do banco" → X) não apaga os campos já preenchidos; o gestor edita à mão.
- Validação (`valid`) e `handleSubmit` permanecem inalterados.
