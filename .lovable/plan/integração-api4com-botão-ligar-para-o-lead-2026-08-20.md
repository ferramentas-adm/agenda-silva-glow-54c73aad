# Integração API4COM — Botão "Ligar para o lead"

Sim, é possível. O fluxo será: botão em **Detalhes do Agendamento** → dispara a ligação na API4COM usando o ramal do usuário logado → o resultado da ligação (duração, status) volta por webhook e é anexado ao log de auditoria.

## O que será construído

### 1. Botão "Ligar"
Em `Detalhes do Agendamento`, ao lado do telefone (junto dos atalhos de WhatsApp/telefone que já existem):
- Botão "Ligar" (ícone de telefone), visível somente quando o lead tem telefone.
- Ao clicar: estado "Chamando…", toast de confirmação ou erro.
- Dois modos de discagem (o mesmo botão, decidido por configuração):
  - **Click-to-call via API (padrão):** o backend pede à API4COM para originar a chamada no ramal do usuário; o softphone dele toca e ao atender a plataforma liga no lead.
  - **Fallback local:** se o usuário não tiver ramal identificado, o botão abre a discagem no aplicativo instalado na máquina (`tel:`), sem registro de duração/status.

### 2. Identificação do usuário na API4COM
Como cada pessoa já usa a extensão logada com o próprio e-mail, o vínculo será feito por e-mail:
- Ao clicar, o backend consulta os ramais/usuários da conta na API4COM e casa pelo e-mail do usuário logado.
- Resultado guardado em cache no perfil (campo novo `api4com_extension`), com opção de ajuste manual em **Administração** caso o e-mail da API4COM seja diferente do e-mail do sistema.
- Se não houver correspondência, o botão cai no modo fallback e avisa o gestor.

### 3. Registro e resultado da ligação
- Nova tabela `chamadas`: quem ligou, agendamento, telefone, id da chamada na API4COM, status, código de status, duração, horários e payload bruto.
- **audit_logs:** cada clique gera uma entrada `call_lead` com nome do lead, telefone e horário. Quando o webhook da API4COM chega com o desfecho (atendeu, caixa postal, não atendeu, sem sinal, ocupado, etc.), esse mesmo registro é complementado com **status legível + código + minutagem**.
- Uma tabela de tradução código → texto (ex.: `ANSWERED` → "Atendeu", `NO ANSWER` → "Não atendeu", `BUSY` → "Ocupado", `FAILED` → "Falha/sem sinal", `VOICEMAIL` → "Caixa postal") será mantida no backend e ajustada conforme os códigos reais que a API4COM enviar.
- Em Detalhes do Agendamento: mini histórico "Ligações" (data/hora, quem ligou, status, duração).

### 4. Permissões
Quem pode acionar o botão: SDR, Closer, Supervisor, Moderador e Gestor. O histórico de ligações segue a mesma regra de visibilidade já usada para as informações do lead (dono do lead vê o seu; gestão vê todos).

## Detalhes técnicos

- Secret novo: `API4COM_API_TOKEN` (será solicitado na implementação).
- Edge function `api4com-call`: valida sessão, resolve o ramal do usuário, chama a API de originação da API4COM, cria a linha em `chamadas` e o `audit_logs`.
- Edge function `api4com-webhook` (`verify_jwt = false`, protegida por token na query/header): recebe o payload de status da API4COM, atualiza `chamadas` e complementa o `details` do log de auditoria.
- Migração: tabela `chamadas` com GRANTs + RLS (insert/select pelo próprio autor, select total para gestão, updates só pelo service role), coluna `profiles.api4com_extension`, índices por `agendamento_id` e `provider_call_id`.
- Frontend: novo componente `LigarLeadButton` + hook `useApi4comCall`, usado em `src/pages/LeadDetalhesPage.tsx`.

## Ponto a confirmar durante a implementação
A URL/endpoint exato de originação e o formato do webhook da API4COM serão validados com o token real; se a conta não permitir click-to-call por API, o botão fica no modo fallback (discagem na extensão local) e o registro guarda apenas o clique, sem duração.
