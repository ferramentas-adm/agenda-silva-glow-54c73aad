# Torre de Controle: situação atual

## Itens resolvidos (já no ar)

### Item 4: toda a equipe conta como equipe — feito
- Além dos closers, qualquer usuário do sistema com e-mail @ogruposilva.com.br conta como equipe: gestores, moderadores e SDRs.
- O nome oficial do Google (planilha) fica guardado nos bastidores; os nomes exibidos nas telas não mudam.
- Closer em reunião de outro para aprender conta como equipe, não como lead.
- Regra de comparação: primeiro nome + sobrenomes que fazem parte do nome oficial; bolinha amarela quando o nome é idêntico ao do lead.

### Item 2: bolinha vermelha no "Abrir no CRM" — feito
- Nova função `datacrazy-conversas` consulta as conversas no CRM pelo telefone (cache de 30s).
- Quando o lead manda mensagem que ainda não foi respondida, o botão ganha um ponto vermelho pulsante.

## Pendências

### Item 3: "Abrir no CRM" abrir a conversa exata

**Descoberto agora:** ao clicar numa conversa do DataCrazy, a URL não muda — o endereço continua sendo só `?search=<telefone>&instances=<instância>`. Ou seja, a tela do DataCrazy não expõe um deep link para a conversa.

**Porém, temos uma pista:** a API do DataCrazy (que já usamos para a bolinha vermelha) devolve o `conversationId` de cada conversa — para a conversa do Gessica (559183567045) esse ID está disponível no servidor. Resta descobrir se a tela aceita esse ID na URL.

**Próximo passo (teste com você):**
1. Eu monto um link de teste no formato atual + `&conversationId=<id>` (ex.: `https://crm.datacrazy.io/multiservice?search=559183567045&instances=6aaed957bfce5b063bb12a80&conversationId=101173`) e te mando aqui no chat.
2. Você abre esse link no navegador e me diz se abriu direto na conversa certa (sem precisar buscar).
3. Se abrir: eu troco todos os botões "Abrir no CRM" da Torre para esse formato novo — conversa exata, zero busca visual.
4. Se não abrir: sem deep link. O botão continua abrindo a busca pelo telefone, e a alternativa real seria pedir ao suporte do DataCrazy o formato de link direto.

### Item 1: sala de espera (link do Grupo Silva) — não fazer por enquanto
- Decisão: nada será feito agora.
- O estudo de consequências (troca de todos os links enviados ao lead, dependência do nosso site, filtros de clique) fica guardado para uma fase futura, caso a ideia volte.
