# Downsell do SDR IA

## Banco
- Criar `sdr_downsell` com `telefone` como chave primária, validação de 10–11 dígitos, valores permitidos para `etapa`, defaults solicitados e índices em `etapa` e `form_at`.
- Manter a tabela fechada para usuários do aplicativo, com acesso interno do backend, e atualizar `updated_at` automaticamente.
- Criar uma tabela interna de limite por IP, armazenando apenas o hash irreversível do endereço e o minuto da chamada; registros antigos serão eliminados após 24 horas.
- Criar operações internas atômicas para contar até 60 chamadas por IP/minuto e registrar eventos sem apagar dados já existentes.

## Proxy do SDR IA
- Autorizar `sdr_downsell` no `/sdr-ia-db`, preservando os filtros PostgREST e o `resolution=merge-duplicates` já repassado pelo campo `prefer`.
- Não alterar o comportamento das três tabelas que o proxy já atende.

## Endpoint público
- Criar `POST /sdr-ia-downsell-evento`, sem chave de acesso e com CORS liberado.
- Validar `telefone`, `evento` e campos opcionais; responder `400` para dados inválidos e `429` após 60 chamadas no mesmo minuto por IP.
- Em `pagina`, gravar `pagina_vista_em` e definir a expiração para 24 horas somente quando ainda estiver vazia.
- Em `clique`, gravar `clicou_em` e mudar a etapa para `clicou`.
- Responder `200 {"ok":true}`.

## Validação
- Implantar a tabela e o endpoint.
- Confirmar CORS, validações e registro real de um evento público.
- Confirmar leitura e upsert da nova tabela através do `/sdr-ia-db`.
