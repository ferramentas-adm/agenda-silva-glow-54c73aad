# Bug: SDR consegue agendar direto na agenda de um Closer

## Causa raiz

No `src/pages/AgendarPage.tsx`, a flag `isSdrOverride` depende de uma `useQuery` que busca `profiles.is_sdr_override`. Enquanto essa query não resolve, `currentProfile` é `undefined` e portanto:

- `isSdrOverride = false`
- `canPickCloser = isAdmin || (role === "closer" && !isSdrOverride)` → para um usuário com role `closer` + override SDR, isso vira **`true`** no primeiro render.

Os estados iniciais do componente são definidos via `useState(...)` usando esse `canPickCloser` do primeiro render:

- `const [step, setStep] = useState<Step>(isReschedule ? (canPickCloser ? "closer" : "datetime") : ...)`
- `const [closerId, setCloserId] = useState<string | null>(canPickCloser ? (preCloserId || null) : null)`

Quando a query resolve e `canPickCloser` vira `false`, esses `useState` **não são reavaliados** — o componente continua exibindo a tela de seleção de Closer e mantém o `closerId` pré-selecionado vindo da URL (`?closer=...`). Resultado: SDRs com override (closers reclassificados como SDR pelo Admin) conseguem agendar diretamente na agenda de um Closer.

A mesma janela permite uso direto de URLs `/agendar?closer=...&date=...&time=...` por SDRs override.

## Correção

No `src/pages/AgendarPage.tsx`:

1. Tornar a query `current-profile-sdr-override` bloqueante para a renderização:
   - Expor `isLoading` da `useQuery`.
   - Antes do `return` do JSX, se `user` existir e o profile ainda estiver carregando (`isLoading || currentProfile === undefined`), renderizar um placeholder simples ("Carregando…") em vez do formulário.
   - Isso garante que `isSdrOverride`, `isSdrRole`, `canPickCloser`, `isCloser` e `channelTypeRequired` já estejam corretos antes de qualquer `useState` inicializar.

2. Como defesa adicional, sanear os params da URL quando `canPickCloser` for `false`:
   - Adicionar um `useEffect` que, ao mudar `canPickCloser` para `false`, force `setCloserId(null)` e, se `step === "closer"`, mova para `"datetime"`. Cobre o caso de algum link antigo persistido em cache.

## Fora de escopo

- Nenhuma mudança em backend, RLS, edge functions ou outras telas.
- Lógica de `isSdrRole`/`canPickCloser` permanece igual; só corrigimos a ordem em que ela é aplicada.
