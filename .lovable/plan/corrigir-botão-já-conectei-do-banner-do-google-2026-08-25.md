# Corrigir botão "Já conectei" do banner do Google

## Diagnóstico (confirmado)

A conta da Giovanna **está** corretamente conectada no banco: token existe, com a permissão de gravação do Meet, atualizado em 25/08 02:38 UTC.

O problema é de permissão de leitura, não de conexão. A tabela `closer_google_tokens` está **sem nenhum GRANT** (consulta de privilégios retornou vazio). Existem políticas de acesso corretas ("closer lê o próprio token", "gestor gerencia"), mas sem GRANT o banco recusa a leitura antes de avaliar a política. Isso provavelmente veio da rodada de endurecimento de segurança recente.

Resultado: o banner sempre recebe "nenhum token" e por isso:
- continua aparecendo mesmo depois de conectar;
- o botão "Já conectei" sempre responde "Ainda não encontramos a autorização".

## Correção

1. **Banco**: conceder acesso de leitura/escrita coerente com as políticas já existentes de `closer_google_tokens`:
   - `GRANT SELECT` para `authenticated` (a política já limita cada closer ao próprio token e o gestor a todos);
   - `GRANT INSERT, UPDATE, DELETE` para `authenticated` (usado pelo gestor via política "Gestors can manage google tokens");
   - `GRANT ALL` para `service_role` (usado pelas Edge Functions de OAuth/agenda).
2. **Front-end** (`src/components/GoogleCalendarBanner.tsx`): parar de engolir erro da consulta — se a leitura falhar, lançar erro e o "Já conectei" avisar "não foi possível verificar" em vez de afirmar que não há autorização. Assim uma falha de permissão nunca mais se disfarça de "desconectado".
3. **Verificação**: repetir a checagem de GRANTs nas outras tabelas tocadas no endurecimento de segurança (`closers`, `closer_google_tokens` e demais tabelas públicas usadas pelo app) e corrigir as que ficaram sem GRANT, mantendo as políticas atuais.

## Como validar

- Abrir a tela como a closer piloto: o banner deve desaparecer (token + escopo presentes).
- Para uma closer sem escopo com gravação ligada, o banner deve mostrar "Reautorize o Google" e o "Já conectei" confirmar somente após a reautorização.
- Confirmar no painel Admin que os selos de conexão do Google voltam a mostrar o estado real.
