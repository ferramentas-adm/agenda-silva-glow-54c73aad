# Escolher o closer que fechou a venda

## O caso real

O lead fez a reunião com um closer, mas outro closer ligou depois e fechou a venda. Hoje:

- No formulário de **Nova venda avulsa**, o campo Closer já é editável (o preenchimento automático vem do histórico e pode ser trocado).
- O problema está no outro caminho, o recomendado pelo próprio aviso do formulário: quando o lead **tem reunião no sistema** e o gestor clica em "Abrir a reunião e lançar a venda lá", a tela de lançamento da venda **não tem campo de closer** — o crédito vai obrigatoriamente para o closer da reunião.

## Como fica

No modal de lançamento da venda (o que abre pelo card da reunião e pelo botão "Abrir a reunião e lançar a venda lá"):

- Novo campo **"Closer que fechou a venda"**, já preenchido com o closer da reunião e livre para troca entre os closers ativos.
- Ao escolher outro closer, aparece um aviso curto: "O crédito desta venda passa para <nome>. A reunião continua registrada com <closer original>."
- Campo obrigatório de justificativa curta (mínimo 20 caracteres) quando o closer é trocado — ex.: "fechou por ligação depois da reunião".
- Ao salvar, o crédito da venda (conversão, receita, Performance por Closer, saldo residual) passa para o closer escolhido; a troca fica registrada nos logs de auditoria com closer anterior, novo closer e justificativa.
- Sem troca, nada muda no comportamento atual.

No formulário de **Nova venda avulsa**, apenas um reforço visual: o rótulo passa a "Closer que fechou a venda" com a nota "pode ser diferente do closer da reunião" quando o closer veio preenchido automaticamente do histórico.

## Detalhes técnicos

- `src/components/dashboard/GestorVendaDialog.tsx`: carregar `closer_id` do agendamento junto da venda existente; novo `Select` de closers ativos (query `["gestor-venda-closers"]`, `closers` ativos ordenados por nome); estado `closerId` + `closerJust`; `canSubmit` exige justificativa quando `closerId !== closerOriginalId`.
- Ao salvar com closer trocado, chamar a função existente `reassign_agendamento_closer_for_result` (mesma usada em `OverdueMeetingsLockOverlay.tsx:226`) antes do upsert da venda; se ela retornar falso, abortar com mensagem clara. Todas as métricas leem `agendamentos.closer_id`, então o crédito acompanha automaticamente.
- Auditoria: nova ação `venda_closer_trocado` em `logAudit` (lead, closer anterior, closer novo, justificativa) e o campo já existente de `venda_lancada_gestor` ganha `closer_id`. Registrar o rótulo dessa ação em `src/pages/AuditLogsPage.tsx`.
- `src/components/dashboard/AvulsaSaleDialog.tsx`: somente rótulo/legenda do campo Closer — nenhuma mudança de lógica.
- Sem alterações de banco, RPCs de dashboard, webhooks ou rotas de API.
