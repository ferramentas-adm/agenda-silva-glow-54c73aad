
# Verificação: payload de "Agendado" — segunda reunião vs reunião normal

Não foi feita nenhuma alteração. Apenas leitura do trigger `public.notify_status_change_webhook` (que monta o payload no INSERT em `agendamentos`) e do fluxo de criação de 2ª reunião em `src/pages/AgendarPage.tsx`.

## Resumo executivo

**Estrutura do JSON:** idêntica nos dois casos — mesmas 30 chaves, mesma ordem, mesmo tipo. Nenhuma chave é adicionada ou removida quando `is_segunda_reuniao = true`.

**Valores:** há 3 diferenças esperadas (intencionais) e 1 divergência que pode causar problema no CRM.

## Diferenças esperadas (intencionais, corretas)

Ao criar 2ª reunião (INSERT, status=Agendado):

| Campo | Normal | Segunda reunião |
|---|---|---|
| `is_segunda_reuniao` | `false` | `true` |
| `meeting_reason` | `""` (vazio) | `"segunda_reuniao"` |
| `lead_revenue`, `motivo_nao_fechamento`, `explicacao_nao_fechamento`, `valor_apresentado` | `null` | herdados da venda da reunião original |
| `recebimento_acordado`, `valor_previsto`, `data_prevista` | `false` / `null` | preenchidos se houve pagamento acordado na reunião original |

Isso é by-design: o CRM recebe o contexto da 1ª reunião junto com a nova agenda.

## Divergência que pode causar dado faltando: `sdr_name`

- **Reunião normal:** `sdr_name` vem de `profiles.full_name` usando `COALESCE(sdr_responsavel_id, created_by)`. Sempre resolve para quem criou/é responsável.
- **Segunda reunião:** o trigger **ignora** `sdr_responsavel_id`/`created_by` da nova agenda (que normalmente é o Closer) e busca em `agendamentos` pela reunião anterior **mesmo telefone** cujo `created_by` tenha role `sdr`:

```sql
JOIN user_roles ur ON ur.user_id = a.created_by AND ur.role = 'sdr'
WHERE regexp_replace(a.lead_phone,'\D','','g') = regexp_replace(NEW.lead_phone,'\D','','g')
```

**Consequência:** `sdr_name` volta **vazio** (`""`) sempre que:
1. A reunião original foi criada pelo próprio Closer (sem SDR antes na jornada) — cenário comum;
2. O telefone da 2ª foi digitado diferente do da 1ª (mesmo com normalização, se dígitos divergem);
3. O criador original tem outra role (gestor/moderador/admin) e nunca foi SDR.

Em reunião normal isso nunca acontece. No CRM, o mesmo lead pode chegar com `sdr_name` preenchido na 1ª reunião e vazio na 2ª — o que pode quebrar automações que roteiam por SDR.

## Observação adicional (fora do trigger)

O reenvio via `src/services/datacrazyAgendamento.ts` (usado em edição/reagendamento pelo cliente) monta um payload **reduzido** (~11 chaves) com um subconjunto do trigger — não inclui `is_vendido`, `is_follow_up`, `is_perdido`, `lead_revenue`, `valor_apresentado`, `motivo_nao_fechamento`, `explicacao_nao_fechamento`, `follow_up_date/time`, `observacoes`, `recebimento_acordado`, `valor_previsto`, `data_prevista`, `vendeu`, `valor_coletado`, `resumo_venda`, `deleted_at`, `deletion_reason`. Isso vale tanto para segunda reunião quanto para reunião normal — ou seja, é uma divergência entre "reenvio manual" vs "trigger", não entre "segunda vs normal".

## Conclusão

- **Estrutura**: OK, idêntica.
- **Valores**: as diferenças em `is_segunda_reuniao`, `meeting_reason` e os 7 campos herdados da venda anterior são propositais.
- **Ponto de atenção real**: `sdr_name` pode vir vazio na 2ª reunião mesmo havendo SDR responsável pela nova agenda, porque o trigger tenta reconstituir o SDR original em vez de usar o `sdr_responsavel_id`/`created_by` da nova linha.

## Próximo passo sugerido (aguardando sua decisão)

Se você quiser alinhar o comportamento, três caminhos possíveis — me diga qual seguir:

1. **Fallback**: manter a busca do SDR original, mas se vier vazio usar `COALESCE(sdr_responsavel_id, created_by)` da nova agenda como no caso normal.
2. **Igualar ao normal**: usar sempre `sdr_responsavel_id`/`created_by` da nova agenda, ignorando lookup por telefone.
3. **Não mexer**: manter como está (CRM continuará recebendo `sdr_name=""` em parte das 2ªs reuniões).
