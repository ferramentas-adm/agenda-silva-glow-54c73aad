## Mudanças em `src/components/VendaDialog.tsx` (ramo "Vendeu? = Não")

1. **Remover** o bloco "Houve erro do SDR nesta reunião" (checkbox `sdrError`). O campo `sdr_error` continua sendo salvo como `false` para não quebrar o `ErrosSDRTab` (registros antigos seguem visíveis).

2. **Adicionar** novo campo obrigatório `Apresentou o preço? *` (RadioGroup Sim/Não), logo após "Explicação do porque não fechou".

3. **Produto ofertado *** — sempre visível no ramo "Não" (independente de ter apresentado preço ou não), usando o mesmo `Select` com `produtosList` do ramo "Vendeu = Sim". Obrigatório quando há produtos cadastrados.

4. **Valor apresentado ao cliente *** — exibido **apenas quando "Apresentou o preço? = Sim"**, e passa de opcional para **obrigatório** (campo `valor` já existente, sem o "(opcional)" no label). Quando "Não", esconder e limpar `valor`.

5. **Validação (`canSubmit`)** no ramo `vendeu === "nao"`:
   - `apresentouPreco` precisa estar definido.
   - Se `produtosList.length > 0`: `produto` obrigatório.
   - Se `apresentouPreco === "sim"`: `valorValido` obrigatório.

6. **Persistência** no `upsert` de `vendas` (sem mudança de schema):
   - `produto`: salvar sempre que preenchido (inclusive no ramo "não").
   - `valor`: salvar apenas quando `apresentouPreco === "sim"` (caso contrário `null`).
   - `sdr_error`: sempre `false`.
   - Mesmo ajuste no payload do webhook DataCrazy (`produto`, `valor`, `valor_apresentado`).

7. **Estado**: adicionar `apresentouPreco: "sim" | "nao" | null`, incluir em `resetAllFields()` e na carga de venda existente — inferir `"sim"` se houver `valor > 0` salvo, senão `"nao"`.

Sem migrações nem mudanças em outras telas.
