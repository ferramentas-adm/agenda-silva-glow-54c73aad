## Tornar o modal de classificação ajustável

No `MetricDrilldownDialog.tsx`, ao abrir via "Ajustar", o modal hoje só mostra o título fixo (acerto ou erro). Mudar para:

1. **Sempre mostrar um seletor de status** no topo do modal (RadioGroup ou dois botões toggle): "Erro do Closer" / "Foi acerto". O valor inicial vem da classificação atual.
2. **Campo de descrição condicional**: o `Textarea` aparece sempre que `classifyKind === "closer_error"` (já é assim — só passa a reagir ao toggle). Se o usuário trocar de acerto → erro, o campo aparece vazio e exige preenchimento (validação atual já cobre).
3. **Título dinâmico** muda conforme o toggle ("Registrar erro do Closer" / "Confirmar como acerto").
4. Lógica de submit (`submitClassify`) já faz UPDATE quando `classifyExistingId` está setado — nada a mudar ali.

Sem mudanças no banco, no fluxo de "Erros Closer" ou em outros componentes.