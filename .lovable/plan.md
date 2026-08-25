# Rollout da gravação/transcrição automática para os demais closers

## Situação verificada agora

- Piloto funcionando: 6 agendamentos saíram no modo `auto` com transcrição ativa (último em 25/08 02:07); 1 fallback antigo (24/08 22:48, antes da correção para a Meet API v2).
- Giovanna Pereira é a única com `auto_recording_enabled = true` e com o escopo `meetings.space.created` no token.
- Os outros 29 closers ativos estão conectados ao Google, mas **nenhum tem o escopo do Meet**. Ligar a flag para eles hoje não gera gravação automática: o código detecta escopo ausente e cai no fluxo atual.

Ou seja: tecnicamente está aprovado, mas o rollout depende de cada closer reconectar o Google uma vez. Sem esse passo, nada quebra — só não ativa.

## Ajustes necessários antes de ligar para todos

1. **Banner de reconexão direcionado**: quando o closer tem a flag ligada e o token sem o escopo do Meet, mostrar aviso no painel dele ("Reautorize o Google para ativar a gravação automática") com o botão de conexão, em vez de silenciosamente usar o fallback.
2. **Coluna de status na Administração**: na lista de closers, exibir de forma legível: Conectado com gravação / Conectado sem permissão de gravação / Desconectado (hoje isso existe só no ícone).
3. **Ativação em lote com segurança**: botão "Ativar gravação automática para closers selecionados" na Administração, com seleção múltipla, para o gestor liberar por grupos (ex.: 5 por dia) em vez de um por um.
4. **Painel de acompanhamento do rollout**: contador simples (auto x fallback nos últimos 7 dias, por closer) lendo os registros de auditoria `meet_auto_recording`, para o gestor ver quem já está de fato gravando.

## Rollout recomendado (sem risco de derrubar a operação)

```text
Onda 1 (hoje)   -> 3 a 5 closers: liga a flag, closer reconecta, confere 1 reunião real
Onda 2 (+1 dia) -> se 100% em modo auto, mais 10 closers
Onda 3 (+1 dia) -> restantes
```

Se qualquer onda apresentar fallback recorrente, basta desligar a flag desses closers — o fluxo atual do Calendar continua criando o Meet normalmente.

## Notas técnicas

- Nenhuma alteração no `google-create-event` é necessária: o caminho auto já está validado em produção com a Meet API v2 e o fallback está provado.
- Mudanças ficam em `src/pages/AdminPage.tsx` (status legível, ativação em lote, contador de rollout) e no banner do Google (`src/components/GoogleCalendarBanner.tsx`), mais leitura dos escopos em `closer_google_tokens`.
- A ativação em lote é apenas `UPDATE closers SET auto_recording_enabled` nos ids selecionados; sem migração nova de schema.
- Reconectar o Google não desconecta o closer do painel nem afeta outros closers.
