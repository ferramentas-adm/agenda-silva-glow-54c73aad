# Torre de Controle: ajustes

## Respostas às suas duas perguntas

### Consequências ocultas de trocar para um link do Grupo Silva (item 1)
- **Todo link enviado ao lead muda.** Os lembretes (webhook do DataCrazy), a IA SDR e as mensagens manuais dos SDRs passariam a enviar o nosso link, e não o do Meet. Quem continuar mandando o link cru do Meet não será rastreado.
- **Se o nosso site cair, o lead não consegue entrar.** Hoje o lead vai direto para o Google. Com o nosso link, existe um passo a mais no caminho.
- **"Clicou" não é o mesmo que "está na sala de espera".** Significa só que o lead abriu o link. Ele pode desistir antes de pedir para entrar.
- **Pré-visualização e robôs.** O WhatsApp abre o link para montar a prévia, e isso poderia contar como clique. É preciso filtrar.
- **Vantagem:** se o closer mudar, o mesmo link passa a apontar para a sala nova. Isso resolve o problema de "vários links na conversa".
- **Sugestão:** fazer numa fase separada, depois que você confirmar que os lembretes conseguem enviar o novo link.

### Carga das chamadas ao DataCrazy (itens 2 e 3)
- As chamadas só acontecem com a Torre aberta. É uma consulta a cada 30 segundos para as reuniões daquela hora (cerca de 20 a 40 leads), feita só no servidor.
- O sistema e o banco de dados continuam tão rápidos quanto hoje. O resto do app não é afetado.
- O único risco é o limite de requisições do próprio DataCrazy. Para evitar isso, os resultados ficam guardados por 30 segundos e são compartilhados entre todos que estão com o painel aberto. Cinco gestores com o painel aberto fazem o mesmo número de chamadas que um.

## O que será feito agora

### Item 4: toda a equipe conta como equipe (aprovado)
- Além dos closers, **qualquer usuário do sistema com e-mail @ogruposilva.com.br** conta como equipe: gestores, moderadores e SDRs.
- O nome oficial do Google desses usuários é preenchido nos bastidores, a partir da planilha que você enviou. Os nomes que aparecem no sistema não mudam.
- Um closer menos experiente que entra na reunião de outro para aprender **conta como equipe, e não como lead**. Conferido: os 22 closers ativos já têm o nome oficial preenchido.
- A regra de comparação de nomes continua como hoje (primeiro nome + sobrenomes que fazem parte do nome oficial). A bolinha amarela para nomes idênticos também continua.

### Itens 2 e 3: pesquisa no DataCrazy (primeiro passo)
1. Procurar a API de conversas/mensagens do DataCrazy e testar com a chave que já temos.
2. Se der para encontrar a conversa do lead pelo telefone:
   - **Item 3:** "Abrir no CRM" abre exatamente essa conversa, e não a página de resultados da busca.
   - **Item 2:** uma bolinha vermelha com contador no botão quando o lead mandar uma mensagem que ainda não foi lida.
3. Se a API não oferecer isso, eu volto com o que é possível antes de construir qualquer coisa.

### Item 1: sala de espera
- Depende da sua aprovação depois de ler as consequências acima. Não faz parte desta etapa.

## Detalhes técnicos
- Nova coluna `google_name` (opcional) em `profiles`, preenchida cruzando os e-mails com o CSV (`/mnt/user-uploads/...`). `meet-presenca` carrega `closers.google_name` mais `profiles.google_name` dos usuários ativos.
- `google-callback` também grava `profiles.google_name` quando o usuário conecta o Google.
- Nova função `datacrazy-conversas` (ou uma ação a mais no proxy): recebe telefones e devolve `{conversationId, naoLidas}`. Cache em memória de 30s por telefone. Chamada pela Torre a cada 30s, só enquanto ela estiver aberta.
