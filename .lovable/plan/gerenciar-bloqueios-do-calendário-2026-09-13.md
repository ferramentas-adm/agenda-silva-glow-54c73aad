# Gerenciar bloqueios do calendário

## Calendário

- Tornar cada bloco de compromisso clicável e abrir um modal com closer, motivo, descrição, data e intervalo.
- Mostrar **Remover bloqueio** e **Editar horário** para Administrador/Gestor e Moderador; o closer dono continuará com a opção de remover o próprio bloqueio.
- Validar o novo intervalo antes de salvar, atualizar o calendário imediatamente e manter bloqueios recorrentes identificados no modal.
- Exigir confirmação antes da remoção.

## Administração

- Adicionar a aba **Bloqueios** para Administrador/Gestor e Moderador.
- Listar bloqueios com nome do closer, data ou recorrência, motivo, descrição e horário.
- Permitir filtro por data e busca por descrição, seleção individual ou de todos os resultados e remoção em lote com confirmação.
- Assim, os oito bloqueios de **Reunião interna / Evento de Cultura** de 15/09/2026 poderão ser localizados e removidos juntos pela interface.

## Segurança e histórico

- Ajustar as permissões do banco para Administrador/Gestor e Moderador editarem e removerem bloqueios, preservando ao closer apenas a gestão dos próprios registros.
- Registrar cada remoção em **Logs de Auditoria**, com usuário responsável, closer, data, horário, motivo, descrição e instante da remoção.
- Exibir os novos eventos com nomes claros em `/audit-logs`.

## Validação

- Verificar no computador e no celular a abertura do modal, edição, remoção individual e remoção em lote.
- Confirmar que o calendário e os seletores de disponibilidade refletem as alterações sem recarregar.
- Confirmar que usuários sem permissão não recebem ações administrativas e que o closer não remove bloqueios de terceiros.
