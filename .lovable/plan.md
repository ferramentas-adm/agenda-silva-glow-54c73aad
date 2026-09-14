# Templates de lembrete com vídeo

## Objetivo
Preparar o app para registrar com precisão qual template de 1h ou 24h foi enviado, sem alterar o lembrete de 10 minutos e sem disparar mensagens.

## Implementação
- Acrescentar ao agendamento um campo de texto para o nome do template efetivamente enviado, preservando `lembrete_video_enviado` como o instante do envio.
- Atualizar o endpoint de registro para receber e validar um dos quatro templates de 1h/24h (novo ou fallback).
- Gravar `lembrete_video_enviado` somente quando o template com vídeo tiver sido enviado; gravar sempre o nome do template efetivamente usado.
- Manter o registro idempotente e restrito a reuniões `agendada`, `confirmada` ou `pendente`.
- Expor o nome do template junto ao timestamp em `/silva-reunioes`.
- Implantar a mudança e validar apenas com requisição não autorizada, sem envio para leads.

## Limite externo
A seleção do template novo e o fallback imediato para o atual acontecem na automação “API OFC - LEMBRETES 2211”, que não está conectada a este projeto. O app ficará pronto para registrar o resultado, mas essa regra externa ainda precisa ser configurada na própria automação.
