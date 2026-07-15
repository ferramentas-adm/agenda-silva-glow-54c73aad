Texto executivo pronto para colar em e-mail/Slack para a diretoria. Não há mudança de código.

---

**Assunto: Esclarecimento — divergência entre "Agendas Geradas" (Dashboard) e "Lista de Reuniões"**

Prezados,

Recebemos a observação de que os números do card **"Agendas Geradas Hoje"** (Dashboard Comercial) não batem com o total exibido na **Lista de Reuniões** para o mesmo dia. Segue o esclarecimento:

**Os dois números estão corretos — respondem a perguntas diferentes.**

| Indicador | O que mede | Exemplo (15/07/2026) |
|---|---|---|
| Card "Agendas Geradas" | Produtividade do time de SDR — apenas **agendas NOVAS criadas por SDRs** | **62** |
| Lista de Reuniões | Visão operacional — **TODOS os registros do dia**, para gestão de agenda | **113** |

**Ponto-chave: reagendamento também aparece com status "Agendada".**

Quando um lead remarca, o sistema cria um **novo registro com status "Agendada"** apontando para a reunião original (preservamos o histórico completo para auditoria). Ou seja, olhando só a coluna "Status" na Lista, **uma agenda nova e um reagendamento parecem idênticos** — ambos aparecem como "Agendada". A diferença é interna: o reagendamento tem vínculo com a reunião anterior e, por isso, **não é contado como prospecção nova** no card do Dashboard.

**Por que a Lista mostra mais:**

1. **Reagendamentos (43 no dia):** aparecem na Lista com status "Agendada" porque são reuniões reais que vão acontecer, mas **não contam como produtividade de prospecção** — o SDR não gerou lead novo, apenas remarcou um contato que já existia.
2. **Agendas criadas por não-SDRs (8 no dia):** gestores e closers também lançam reuniões pelo Calendário (encaixes estratégicos, follow-ups). Aparecem na Lista, mas **não entram no card de produtividade SDR**.

**Conta:** 113 − 43 reagendamentos − 8 não-SDR = **62** ✅

**Como conciliar os números na tela:**

Na Lista de Reuniões, ative os dois filtros:
- ☑ **Excluir reagendamentos** — separa visualmente "Agendada nova" de "Agendada por remarcação"
- ☑ **Apenas criados por SDR**

O total exibido passa a coincidir 100% com o card do Dashboard.

**Por que mantemos as duas visões separadas:**
- Unificar em 113 inflaria artificialmente a produtividade dos SDRs (contaria remarcações como prospecção nova).
- Unificar em 62 esconderia 51 reuniões reais da agenda operacional do dia.

Cada tela serve ao seu público: **Dashboard = performance de time**, **Lista = operação da agenda**.

Qualquer dúvida, à disposição.
