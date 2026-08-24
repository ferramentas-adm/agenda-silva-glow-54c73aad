# Desconectar a conta Google do Closer pelo painel Admin

Objetivo: dar ao Gestor um botão, na página Administração, que desconecta a conta Google de um closer. Na próxima vez que o closer abrir/atualizar o painel de agendamentos, o aviso "Sua agenda Google não está conectada" reaparece e ele mesmo conecta de novo — já concedendo a permissão nova de gravação automática.

## Como vai funcionar

1. Na linha de cada closer, na aba de usuários da Administração, aparece um ícone de status do Google:
   - **verde/primário**: conectado e já com a permissão de gravação automática;
   - **amarelo**: conectado, mas ainda sem a permissão de gravação (precisa reconectar);
   - **cinza**: não conectado.
2. O Gestor clica no ícone e abre uma confirmação explicando o efeito: a agenda do closer deixa de ser lida e novos eventos não serão criados até ele reconectar.
3. Ao confirmar, a conexão Google daquele closer é removida.
4. O closer atualiza a página do painel e vê o botão "Conectar Google Calendar" (o aviso já existente). Ao conectar, o Google pede o consentimento com o escopo novo do Meet.
5. A ação fica registrada no histórico de atividades, com quem desconectou e qual closer.

Observações:
- Só o Gestor vê e usa esse botão (mesma regra dos outros botões administrativos da linha).
- Nada é excluído além da conexão: agendamentos, eventos já criados e histórico continuam intactos.
- Se o closer estiver com a gravação automática ligada e ainda não tiver reconectado, o sistema segue criando as reuniões do jeito atual (fallback) — nada para de funcionar.

## Detalhes técnicos

- `src/pages/AdminPage.tsx`
  - Na query `admin-all-users`, buscar `closer_google_tokens` (`closer_id, granted_scopes`) e mapear para cada closer: `googleConnected` e `googleHasMeetScope` (verifica se `granted_scopes` contém `https://www.googleapis.com/auth/meetings.space.created`).
  - Novo botão de ícone (`Unlink`/`CalendarX` do lucide) na linha, condicionado a `u.role === "closer" && u.closerId && canActOn(u.role)`, com `title` refletindo os três estados; desabilitado quando não há conexão.
  - Novo `AlertDialog` de confirmação (estado `disconnectGoogleTarget`, `savingDisconnectGoogle`), seguindo o padrão dos diálogos já existentes.
  - Ação: `supabase.from("closer_google_tokens").delete().eq("closer_id", closerId)` — a policy `Gestors can manage google tokens` (`ALL` com `is_gestor()`) já permite isso, sem migração nem edge function.
  - Depois: `logAudit(...)` com ação `google_disconnect` (entity `closer`), `toast.success`, e invalidar `admin-all-users`, `closer-has-google-token` e `closers`.
- Nenhuma mudança necessária em `GoogleCalendarBanner.tsx`: ele já esconde o aviso só quando existe token e revalida no foco da janela, então após a exclusão o botão de conectar volta a aparecer.
