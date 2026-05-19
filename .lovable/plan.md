## Plano

### 1. Deletar duplicatas

**Kauane / Anderson** — manter a venda de ontem (agendamento `707e62b1…`, scheduled_date 18/05). Deletar a venda do agendamento `4af7cbe1…` (15/05, fechada hoje via follow-up).

**Caio Devecchi** — não deletar agora. Pedir ao André (closer) qual manter:
- `666b13f6…` (reunião 14/05, fechada hoje via follow-up)
- `fb787165…` (reunião 19/05, fechada direto)

→ Vou perguntar logo abaixo qual manter antes de executar.

A deleção: `DELETE FROM vendas WHERE id = …` (sem mexer no agendamento — fica como "realizada" sem venda associada, ou também removo o agendamento duplicado se for o caso).

### 2. Alerta de possível duplicata na aba Vendas

Em `src/components/dashboard/VendasTab.tsx`:
- Detectar vendas com **mesmo `lead_name` (normalizado) + mesmo `closer_id`** com `scheduled_date` ou data de fechamento dentro de uma janela curta (ex.: ±7 dias).
- Marcar visualmente cada linha duplicada com um badge âmbar "Possível duplicata" + tooltip listando a(s) outra(s) venda(s) (data + valor).
- Não esconde registros — só sinaliza para revisão manual.

### 3. Terceira opção "Segunda reunião" no VendaDialog

Hoje, quando o closer marca **Vendeu = Não**, aparece apenas:
- [ ] Sim (follow-up)
- [ ] Não (venda perdida)

Trocar por três opções exclusivas:
- [ ] Sim — agendar follow-up
- [ ] Sim — marcar segunda reunião
- [ ] Não — venda perdida

Quando o closer escolher **"Segunda reunião"**:
- Não cria follow-up (`follow_up = false`).
- Mostra data + horário da segunda reunião.
- Cria um **novo `agendamento`** na data escolhida com o mesmo lead/closer/SDR, status `agendada`, observação automática "Segunda reunião — origem: reunião do dd/mm".
- Guarda no banco que a venda atual gerou uma segunda reunião (para evitar contagem dupla no dashboard).

Isso resolve o caso do closer marcar follow-up **e** depois agendar outra reunião manualmente (cenário do Caio e da Kauane).

### Detalhes técnicos

- **Migration:** adicionar coluna `segunda_reuniao boolean NOT NULL DEFAULT false` em `vendas`. Constraint lógica garantida no app: `follow_up` e `segunda_reuniao` nunca verdadeiros ao mesmo tempo.
- **VendaDialog:** trocar `followUp: "sim" | "nao"` por `acompanhamento: "follow_up" | "segunda_reuniao" | "perdeu"`. Reaproveitar os campos de data/horário (rotulando conforme escolha). No submit, se `segunda_reuniao`, inserir novo agendamento e setar `vendas.segunda_reuniao = true`.
- **VendasTab:** ao detectar duplicata visual, ignorar pares onde a venda mais antiga tem `segunda_reuniao = true` (porque a 2ª reunião foi explicitamente esperada).
- **Drilldown / contagem:** vendas com `segunda_reuniao = true` não contam como "não fechou" nem como follow-up; aparecem em separado (ou ficam fora dos cards de fechamento, a definir).

### Fora de escopo

- Não mexer em webhooks DataCrazy, métricas de SDR ou Follow-ups page (a não ser excluir `segunda_reuniao` da lista de follow-ups ativos, o que já acontece naturalmente por `follow_up = false`).
