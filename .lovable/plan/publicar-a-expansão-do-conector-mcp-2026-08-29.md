# Publicar a expansão do conector MCP

Nenhuma alteração de código é necessária. O código das 12 ferramentas já está no projeto e o build está OK; falta apenas o publish, que é o momento em que a função MCP vai ao ar.

## O que será feito

1. Rodar a verificação de segurança e reportar qualquer achado crítico antes de publicar.
2. Publicar o projeto.
3. Confirmar a URL do conector para o Claude: `https://jrnyccjhsxcggmgupvzp.supabase.co/functions/v1/mcp`

## Impacto na conexão existente do Claude

- A conexão e o login OAuth atuais continuam valendo — não é preciso reconectar.
- As 3 ferramentas antigas mantiveram nome e parâmetros; só ganharam campos extras no retorno.
- Após o publish, pode ser necessário reabrir a conversa no Claude para ele atualizar a lista e enxergar as 12 ferramentas.
