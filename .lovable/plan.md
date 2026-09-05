# Aviso automático no WhatsApp quando o sistema cair

Objetivo: você recebe uma mensagem no WhatsApp em **+55 21 99977-3503** sempre que o painel, o banco de dados ou uma das integrações (CRM DataCrazy, Google Agenda, envio de vendas) pararem de funcionar — e outra mensagem quando voltar ao normal.

## Como vai funcionar

Duas camadas, porque uma só não cobre tudo:

```text
1) Vigia EXTERNO (fora do sistema)
   checa o painel de fora, a cada 1 min  ->  se não responder, avisa no WhatsApp
   (funciona mesmo se todo o sistema estiver fora do ar)

2) Vigia INTERNO (dentro do sistema)
   roda a cada 5 min  ->  testa banco, CRM, Google Agenda e envio de vendas
   -> se algo falhar 2 vezes seguidas, avisa no WhatsApp
```

- A camada externa é a única que consegue avisar quando **tudo** cai (inclusive o próprio vigia interno).
- A camada interna é a que percebe problemas "silenciosos": painel abre normalmente, mas o CRM recusa os envios ou a agenda do Google parou de sincronizar.

## O que será criado

1. **Página de saúde do sistema** (endereço público simples) que responde "ok" ou "com problema", já checando banco e integrações. É esse endereço que o vigia externo vai monitorar.
2. **Rotina de verificação a cada 5 minutos** que testa:
   - banco de dados respondendo;
   - CRM DataCrazy aceitando chamadas;
   - Google Agenda respondendo (com o token de um closer conectado);
   - fila de envio de vendas sem acúmulo de erros;
   - reuniões/agendamentos sendo gravados normalmente.
3. **Envio de WhatsApp** para o seu número, com regras anti-spam: avisa na 2ª falha seguida, repete no máximo 1 vez por hora enquanto o problema durar, e manda "voltou ao normal" quando resolver.
4. **Registro de incidentes** no banco (início, fim, o que falhou), para você ver histórico.
5. **Aba "Status do sistema"** no painel Admin: verde/vermelho por item, último incidente e botão "testar aviso agora".

## O que preciso de você

Para mandar WhatsApp automaticamente é obrigatório um serviço de envio. Duas opções:

- **Opção A (recomendada, mais simples):** um serviço de WhatsApp não oficial já pronto (ex.: Z-API, Evolution API ou similar). Você cria a conta, conecta seu número lendo o QR Code e me passa a URL da instância + token. Barato e rápido.
- **Opção B (oficial):** WhatsApp Cloud API da Meta. Mais estável e oficial, mas exige número dedicado, aprovação de template de mensagem e configuração no Meta Business.

Enquanto o WhatsApp não estiver configurado, ativo o mesmo aviso por e-mail para não ficarmos sem alerta.

## Detalhes técnicos

- Novas funções de backend: `system-health` (endpoint público de status, sem dados sensíveis), `system-health-monitor` (roda a verificação e decide se alerta) e `notify-whatsapp` (envio da mensagem).
- Agendamento interno via `pg_cron` a cada 5 min chamando `system-health-monitor` (12 execuções/hora, ~288/dia). Cadência necessária para detecção rápida; o custo é manter o banco acordado nessas checagens. Máximo atraso de detecção interna: ~10 min (2 falhas seguidas).
- Nova tabela `system_health_incidents` (componente, status, mensagem, `started_at`, `resolved_at`, `last_notified_at`) + tabela `system_health_checks` com o último resultado por componente. RLS: leitura para gestor/moderador, escrita apenas pelo service role. GRANTs explícitos.
- Credenciais do provedor de WhatsApp guardadas como segredos (`WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `ALERT_WHATSAPP_NUMBER`), nunca no código.
- Debounce/deduplicação no banco (`last_notified_at`) para evitar enxurrada de mensagens.
- Vigia externo: serviço gratuito (UptimeRobot ou BetterStack) apontando para `/functions/v1/system-health` a cada 1 min, com webhook para `notify-whatsapp`. Configuração feita por você na conta do serviço; eu entrego a URL e o webhook prontos.
- Timezone `America/Sao_Paulo` nas mensagens e nos registros, usando os helpers de `src/lib/timezone.ts`.

## Validação

- Simular falha de banco/CRM e confirmar chegada do WhatsApp em até ~10 min.
- Derrubar o endpoint de saúde e confirmar aviso do vigia externo em até ~2 min.
- Confirmar mensagem de "voltou ao normal".
- Confirmar que nenhuma mensagem repetida chega mais de 1x/hora por incidente.
