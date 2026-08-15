# Botão "Dia inteiro" no Bloqueio em massa

Atalho para bloquear o dia completo sem ajustar horários manualmente.

## Como funciona

- Acima dos campos Início/Fim aparece um botão "Dia inteiro" (com ícone de relógio).
- Ao clicar, os horários viram 09:00 → 23:00 automaticamente (janela completa de atendimento).
- O botão fica destacado (estado ativo) enquanto os horários estiverem exatamente nessa faixa; clicar de novo volta ao padrão 09:00 → 10:00.
- Funciona igual nos modos Pontual e Recorrente; validações e criação dos bloqueios seguem inalteradas.

## Detalhe técnico

- Alteração apenas em `src/pages/BloqueioMassaPage.tsx`: novo handler que seta `startTime`/`endTime`, com variante visual condicionada à comparação dos valores atuais. Sem mudança de banco ou permissões.
