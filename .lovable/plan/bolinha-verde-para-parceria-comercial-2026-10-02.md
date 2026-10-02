# Bolinha verde para Parceria comercial

## O que será alterado
- Reconhecer Parceria quando o briefing contiver “PARCERIA COMERCIAL”, ignorando maiúsculas e acentos, ou quando a observação registrar `Funil: parceria`.
- Criar uma bolinha verde preenchida com tooltip “Parceria comercial”.
- Exibir a bolinha ao lado do nome do lead nos mesmos pontos da bandeira azul: agenda dos closers, detalhe, lista de reuniões e Aguardando atribuição.
- Manter simultaneamente o selo Diretor, a bandeira azul de Imersão e a bandeira laranja de proposta.
- Adicionar “Parceria” ao filtro de funil. O filtro “Padrão” continuará incluindo reuniões de Parceria; apenas Diretor e Imersão permanecem excluídos dele.
- Fazer `POST /silva-agendar` aceitar `funil: "parceria"` e registrar a marca visual sem alterar nome, briefing ou textos usados por automações.

## Validação
- Conferir compilação e testes direcionados da identificação do funil.
- Validar visualmente a agenda em tela ampla e móvel, incluindo a coexistência das sinalizações.
- Validar o endpoint em modo de teste para confirmar que `funil: "parceria"` não retorna erro de payload.

## Detalhes técnicos
- Centralizar a detecção no helper de funis existente, usando a mesma normalização sem acento já usada pela Imersão.
- Estender o tipo do filtro com `parceria`, sem alterar a regra atual do filtro `padrao`.
- Reutilizar os dados de `briefing` e `observation` já carregados pelos agendamentos; nenhuma mudança de banco é necessária porque o funil é persistido em observações.
