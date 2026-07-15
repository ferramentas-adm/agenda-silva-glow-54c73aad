Texto executivo pronto para colar em e-mail/Slack para a diretoria. Não há mudança de código.

---

**Assunto: Esclarecimento — divergência entre "Agendas Geradas" (Dashboard) e "Lista de Reuniões"**

Prezados,

Recebemos a observação de que os números do card **"Agendas Geradas Hoje"** (Dashboard Comercial) não batem com o total exibido na **Lista de Reuniões** para o mesmo dia. Segue o esclarecimento:

**Os dois números estão corretos — respondem a perguntas diferentes.**

| Indicador | O que mede | Exemplo (15/07/2026) |
|---|---|---|
| Card "Agendas Geradas" | Produtividade do time de SDR — apenas **agendas novas criadas por SDRs** | **62** |
| Lista de Reuniões | Visão operacional — **todos os registros do dia**, para gestão de agenda | **113** |

**Por que a Lista mostra mais:**

1. **Reagendamentos (43 no dia):** quando um lead remarca, o sistema cria um novo registro apontando para o original (preservamos o histórico completo para auditoria). Esses registros aparecem na Lista, pois são reuniões reais a acontecer, mas **não contam como produtividade de prospecção** — o SDR não gerou lead novo, apenas remarcou.
2. **Agendas criadas por não-SDRs (8 no dia):** gestores e closers também podem lançar reuniões pelo Calendário (encaixes estratégicos, follow-ups). Aparecem na Lista, mas **não contam como produtividade de SDR**.

**Conta:** 113 − 43 reagendamentos − 8 não-SDR = **62** ✅

**Como conciliar os números na tela:**

Na Lista de Reuniões, ative os dois filtros:
- ☑ **Excluir reagendamentos**
- ☑ **Apenas criados por SDR**

O total exibido passa a coincidir 100% com o card do Dashboard.

**Por que mantemos as duas visões separadas:**
- Unificar em 113 inflaria artificialmente a produtividade dos SDRs (contaria remarcações como prospecção nova).
- Unificar em 62 esconderia 51 reuniões reais da agenda operacional do dia.

Cada tela serve ao seu público: **Dashboard = performance de time**, **Lista = operação da agenda**.

Qualquer dúvida, à disposição.