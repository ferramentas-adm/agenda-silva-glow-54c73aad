# Busca de lead no campo "Nome do cliente" (Nova venda avulsa)

## O que muda para quem usa

No formulário de nova venda avulsa, o campo "Nome do cliente" passa a buscar leads que já existem no painel (leads que já tiveram reunião registrada).

- Ao digitar 2 letras ou mais, aparece uma lista com os leads encontrados, mostrando nome e telefone.
- Ao escolher um lead da lista, o telefone é preenchido automaticamente.
- Se nada for encontrado, o que foi digitado continua valendo como nome novo, digitado à mão, e o telefone é preenchido normalmente pelo usuário (comportamento atual).
- Depois de escolher um lead, é possível trocar o telefone se necessário.

O resto do formulário (canal, SDR, closer, produto, valores, descrição) continua igual.

## Detalhes técnicos

Arquivo alterado: `src/components/dashboard/AvulsaSaleDialog.tsx` (apenas frontend, nenhuma alteração de banco).

- Campo de nome vira um combobox controlado: `Input` + lista de sugestões abaixo (mesmo padrão visual de `src/components/agendar/LeadSearch.tsx`, com `Popover`/lista simples e estado de carregamento).
- Busca com debounce de ~350 ms via `useQuery`, chave `["avulsa-lead-search", termo]`, `enabled` só com 2+ caracteres, `staleTime` 60s:
  ```ts
  supabase.from("agendamentos")
    .select("lead_name, lead_phone, updated_at")
    .is("deleted_at", null)
    .or(`lead_name.ilike.%${termo}%,lead_phone.ilike.%${digitos}%`)
    .order("updated_at", { ascending: false })
    .limit(50)
  ```
  Deduplicação no client por telefone (dígitos) + nome normalizado, mantendo o registro mais recente; exibe no máximo ~10 sugestões.
- Ao selecionar: `setLeadName(nome)` e `setLeadPhone(formatPhone(telefone))`; guarda um estado `leadFromDb` só para exibir um selo "lead do banco" e permitir limpar a seleção.
- Digitar de novo no campo limpa `leadFromDb` (mantém o nome digitado) sem apagar o telefone já preenchido.
- A validação (`valid`) e o `handleSubmit` permanecem exatamente como estão — o insert continua usando `leadName`/`leadPhone`.
