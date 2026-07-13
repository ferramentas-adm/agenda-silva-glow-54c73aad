## Problema

Na página **Administração**, ao clicar em "Redefinir senha (gera senha temporária)", o toast de sucesso aparece mas a senha nunca é exibida no dialog.

**Causa:** o botão usa `AlertDialogAction` (Radix), que fecha o dialog automaticamente ao ser clicado. Quando o dialog fecha, o `onOpenChange` limpa `resetTarget` e `resetGeneratedPassword` para `null` — apagando a senha recém-gerada antes da UI renderizar o bloco de exibição.

## Correção

Em `src/pages/AdminPage.tsx`, no dialog de reset de senha (linhas ~940-948):

- Trocar o `AlertDialogAction` que dispara `handleResetPassword` por um `<Button>` comum (ou adicionar `onClick` com `e.preventDefault()`), para que o dialog **não feche** ao gerar a senha.
- Assim, após `setResetGeneratedPassword(tempPassword)`, o dialog permanece aberto e renderiza o bloco com a senha temporária + botão de copiar.
- O botão "Concluir" (que já existe no ramo `resetGeneratedPassword`) continua fechando o dialog normalmente via `AlertDialogAction`.

Nenhuma outra mudança é necessária — a lógica de geração, a edge function e o bloco visual já estão prontos; apenas o dialog fecha antes da hora.
