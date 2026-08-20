# Inativação de usuários: o que os logs mostram e o que ajustar

## Resultado da verificação (feita agora, sobre os dados reais)

Não existe rotina automática que inative contas. Só dois caminhos alteram `profiles.active`: o botão da página "Usuários" e a função `manage-user` (ação `toggle_active`). Nenhum agendamento/cron/trigger faz isso.

O que os registros de auditoria mostram nos últimos 30 dias (179 inativações/reativações):

- Praticamente **todas as desativações têm a mesma autora: Leticia Rabelo (Administradora)** — inclusive em blocos (7 usuários desativados entre 17:02 e 17:03 de 12/08).
- Em seguida, **Gustavo Martha e Kauan Soares reativam os mesmos usuários** (Cleber Silva, Anderson Silva, Edson Junior, Giovanna Pereira, Julliane, Rafael Alvarenga, Gabriel Cardoso, Bruno Casari…). Só hoje isso aconteceu 6 vezes.
- Ou seja: para o usuário final parece "o sistema me inativou sozinho", mas é ação manual de administrador — e o clique é irreversível sem confirmação nenhuma.

Consistência dos dados: 90 usuários ativos, 48 inativos, **zero divergências** entre `profiles.active` e o registro de Closer correspondente, e nenhum Closer duplicado por e-mail. A base está íntegra.

## O que está confirmado e o que não está (transparência)

Confirmado por consulta direta:

- Só a página "Usuários" e a função `manage-user` gravam `profiles.active` — nenhum cron, gatilho ou webhook faz isso.
- Os nomes dos autores nos registros conferem com o cadastro (comparei `user_id` do log com `profiles`): Leticia 109 ações, Gustavo 45, Kauan 36, João Matias 32 nos últimos 60 dias.
- Para praticamente todos os 48 usuários inativos, a data de alteração do cadastro coincide (diferença de ~1 segundo) com um registro de inativação feito por um administrador. Ou seja, há autor humano identificado.

Não confirmado / limitações desta análise:

- Quatro casos (Victor Lima, Matheus Ranite, Pedro Lopes, Maria Eduarda) têm alteração recente do cadastro sem registro de inativação correspondente na mesma data — provavelmente edição de outro campo (nome, ramal, time), mas não consigo afirmar pelo log atual, porque o log não guarda o campo alterado nem o status anterior.
- O registro de auditoria é gravado pelo navegador **depois** da mudança. Se o navegador fechar ou falhar no meio, a inativação acontece e o log não é criado — então o histórico pode ser incompleto (não confiável como prova definitiva).
- Não tenho acesso à tabela interna de autenticação neste ambiente, então não pude confirmar o estado de bloqueio de login de cada conta nem verificar expiração de sessão. A afirmação de que "a sessão só cai quando o token expira" é baseada no código do app (não há checagem de `active` durante a navegação), não em medição.
- Analisei os últimos 30–60 dias. Se o relato dos usuários for anterior a isso, precisa de nova consulta.

Conclusão honesta: **não encontrei nenhuma inativação automática de contas**, mas encontrei um efeito automático real (Closer desativado e reuniões futuras devolvidas ao pool quando alguém troca a função ou remove da agenda) e um histórico frágil, que é o que impede provar caso a caso.


1. **Chave (switch) de ativo sem confirmação.** Um clique acidental bane o login do usuário, desativa o registro de Closer e faz as reuniões futuras dele voltarem para "Aguardando atribuição" (efeito da trigger já existente). Ele fica encostado a outros ícones pequenos da mesma linha (agenda, função, SDR), o que favorece o clique errado.
2. **Efeito colateral silencioso ao trocar a função ou o "liberar para agenda".** Nesses casos o registro de Closer é desativado automaticamente e as reuniões futuras são devolvidas ao pool — sem aviso na tela. É exatamente o que um Closer percebe como "fui inativado automaticamente".
3. **Escrita duplicada do status do Closer.** A tela chama a função `manage-user` (que já ajusta o Closer) e, em seguida, grava `closers.active` de novo no cliente usando o valor antigo da lista. Redundante e sujeito a inverter o status se a lista estiver desatualizada.
4. **Registro de auditoria pouco confiável.** O log é gravado pelo navegador, com o valor deduzido do estado local (`new_active`), e o nome do autor vem dos metadados do login (pode divergir do cadastro). Não guarda o status anterior nem quantas reuniões foram devolvidas.
5. **Sessão do usuário inativado não cai na hora.** O app não verifica `profiles.active` durante a navegação; a pessoa continua usando até o token expirar, e depois é derrubada de repente — reforçando a sensação de inativação aleatória.

## O que vou implementar

1. **Confirmação obrigatória para desativar** (diálogo com nome do usuário e aviso do que acontece: perde acesso, sai da agenda, reuniões futuras voltam para "Aguardando atribuição"). Reativar continua com um clique.
2. **Aviso antes de trocar função de Closer para outra função** e antes de remover da agenda, explicando que as reuniões futuras serão devolvidas.
3. **Auditoria confiável**: passar a registrar a inativação no servidor (na `manage-user`), com status anterior e novo, autor pelo cadastro e quantidade de reuniões devolvidas.
4. **Remover a escrita duplicada** de `closers.active` na tela; a função `manage-user` passa a ser a única fonte.
5. **Bloqueio imediato de conta inativa**: verificação de `profiles.active` no login e na sessão ativa, com mensagem clara ("sua conta foi desativada, procure um administrador") em vez de erro genérico.
6. **Painel de histórico na própria página "Usuários"**: últimas ativações/inativações (quem, quem foi afetado, quando), para o time enxergar que a ação foi humana e resolver o conflito entre administradores.

## Detalhes técnicos

- `src/pages/AdminPage.tsx`: `AlertDialog` de confirmação em `handleToggleActive` (apenas para desativar) e em `handleChangeSdrTeam`/`handleToggleScheduling`/troca de função quando o alvo é Closer; remoção do `supabase.from("closers").update({ active: !user.active })` redundante; bloco "Histórico de ativações" lendo `audit_logs` (`action = 'toggle_active'`) com `limit 50`.
- `supabase/functions/manage-user/index.ts`: na ação `toggle_active`, inserir o registro em `audit_logs` no servidor (status anterior/novo, autor via `profiles.full_name` do chamador, contagem retornada por `unassign_agendamentos_from_closer`) e retornar essa contagem para exibir no aviso de sucesso.
- `src/contexts/AuthContext.tsx` + `src/components/ProtectedRoute.tsx`: incluir `active` na leitura do perfil; se `active = false`, encerrar a sessão e exibir mensagem específica (mesmo padrão do evento `auth-blocked` já usado no login Google).
- Nenhuma mudança de schema é necessária.
