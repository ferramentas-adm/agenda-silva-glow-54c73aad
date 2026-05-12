## Problema

Quando o Closer André clica em **Realizada** dentro do overlay de "Reuniões vencidas", o `VendaDialog` abre — mas em `z-50`, atrás do overlay (`z-[100]`). Visualmente nada acontece e a tela continua travada.

## Correção

Renderizar o `VendaDialog` acima do overlay. Duas opções equivalentes (vou pela 1, é mais cirúrgica):

1. **Subir o z-index do `VendaDialog` apenas neste contexto**, passando classes `z-[110]` para `DialogOverlay` e `DialogContent` quando aberto a partir do overlay de bloqueio. Como o `VendaDialog` é compartilhado, o caminho mais limpo é aceitar uma prop opcional `contentClassName`/`overlayClassName` (ou um `zIndexClass`) e aplicá-la só quando chamado de `OverdueMeetingsLockOverlay`.

2. Alternativa: subir o z-index global do `Dialog` para algo como `z-[60]` e o overlay de bloqueio para `z-50`. Mais arriscado, mexe em todos os dialogs do sistema.

## Arquivo

- `src/components/VendaDialog.tsx`: aceitar props opcionais para classes e repassar para `DialogOverlay`/`DialogContent`.
- `src/components/OverdueMeetingsLockOverlay.tsx`: ao montar `<VendaDialog>`, passar `z-[110]` para overlay e content.

## Por que não quebra nada

- Mudança puramente visual (classes CSS).
- Sem alteração de banco, RLS, hooks ou lógica de venda.
- Outros lugares que usam `VendaDialog` continuam com z-index padrão.
