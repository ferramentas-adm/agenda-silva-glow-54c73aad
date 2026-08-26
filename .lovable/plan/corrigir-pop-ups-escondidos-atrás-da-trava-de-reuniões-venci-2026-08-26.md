# Corrigir pop-ups escondidos atrás da trava de reuniões vencidas

## O que está acontecendo

A trava de tela ("Atualize as reuniões vencidas para continuar") é renderizada em uma camada alta (`z-[100]`). Os diálogos do shadcn (incluindo o de "Não compareceu" e o de novo agendamento) e o dropdown de motivos são renderizados em `z-50`. Como ambos são portais no `body`, os pop-ups ficam **atrás** da trava: o usuário clica e parece que nada acontece.

## Como corrigir

- Elevar as camadas dos diálogos abertos a partir da trava (overlay e conteúdo) para ficarem acima de `z-[100]`.
- Elevar também o conteúdo do `Select` de motivos, para que a lista suspensa apareça acima do diálogo.
- Nenhuma mudança de comportamento, dados ou permissões — apenas ordem de camadas.

## Detalhes técnicos

- `src/components/NaoCompareceuDialog.tsx`: passar `className="... z-[130]"` no `DialogContent` e usar overlay em `z-[120]` (via prop de classe no `DialogContent`/`DialogOverlay` do shadcn, mantendo o padrão do projeto); no `SelectContent`, adicionar `className="z-[140]"`.
- `src/components/NovoAgendamentoPromptDialog.tsx`: mesmo tratamento de `z-index` para o diálogo que abre em seguida.
- `src/components/OverdueMeetingsLockOverlay.tsx`: se houver outros diálogos/dropdowns disparados de dentro da trava (ex.: "Definir closer que atendeu"), aplicar a mesma elevação de camada.
- Alternativa descartada: baixar o `z-[100]` da trava — isso permitiria que outros elementos da página ficassem acima dela e enfraqueceria a trava.
