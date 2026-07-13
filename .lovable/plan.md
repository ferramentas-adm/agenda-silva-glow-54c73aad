## Objetivo

Na página **Lista de Reuniões (/reunioes)**, um SDR marcado em "Visibilidade Global de SDRs" deve conseguir localizar qualquer lead pelo campo **"Buscar lead..."** (nome ou telefone), inclusive reuniões que pertencem a outros SDRs.

## Situação atual

A regra de visibilidade já é aplicada em `src/pages/ReunioesListPage.tsx` (linha 293):

```ts
if (isSDR && user && !sdrHasGlobalVisibility(user.id) && sdrIdOf(ag) !== user.id) return false;
```

Ou seja, quando o SDR está na lista de visibilidade global, ele já enxerga reuniões de todos os SDRs e o filtro de texto opera sobre esse conjunto. Existem, porém, **dois pontos que podem impedir a busca de funcionar como o usuário espera**:

1. **Dependência faltando no `useMemo`** (linha 328): o array de dependências inclui `sdrGlobalVisibility` (flag booleana), mas **não inclui `sdrGlobalVisibilityUserIds`**. Se o gestor incluir/remover o SDR da lista sem alternar a chave geral, o filtro em memória não recomputa e a busca continua limitada.
2. **Janela server-side de 180 dias** (linha 162, `meetingWindowStart`): a query só carrega agendamentos com `scheduled_date >= hoje − 180 dias` (a menos que o filtro de data "de" seja movido para trás). Isso vale para qualquer usuário, mas é relevante avisar: buscar um lead com reunião fora dessa janela exige ampliar o filtro de datas.

## Alterações

Arquivo único: `src/pages/ReunioesListPage.tsx`

1. Adicionar `sdrGlobalVisibilityUserIds` ao array de dependências do `useMemo` de `filtered` (linha 328) — para que a mudança na lista de SDRs com visibilidade global recompute o filtro imediatamente.
2. Ajustar o **placeholder** do campo para deixar explícito o comportamento quando a Visibilidade Global está ativa para o SDR corrente:
   - Padrão: `"Buscar lead..."`
   - SDR com Visibilidade Global: `"Buscar lead (todos os SDRs)..."`
3. Adicionar um pequeno *tooltip/title* no input informando que a busca cobre reuniões de todos os SDRs quando a Visibilidade Global está ativa, e que reuniões fora da janela de datas atual não entram no resultado (para orientar o usuário a expandir o filtro "Data da reunião" quando necessário).

Nenhuma mudança em RLS, hook `useSdrGlobalVisibility` ou lógica de negócios — apenas na página de listagem.

## Verificação

- Logar como SDR **sem** Visibilidade Global → busca continua restrita às reuniões próprias.
- Logar como SDR **com** Visibilidade Global → digitar nome/telefone de lead de outro SDR retorna a reunião na lista.
- Toggling da lista de usuários da Visibilidade Global (adicionar/remover o SDR) reflete no resultado da busca sem precisar recarregar a página.
