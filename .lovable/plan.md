# Segunda reunião: enviar SDR original e payload completo no webhook

## Decisões (defaults assumidos)

- **SDR original** = primeiro agendamento (mais antigo, não excluído) com o mesmo `lead_phone` normalizado cujo `created_by` tem role `sdr`. É quem trouxe o lead.
- **Fallback**: se nenhum agendamento anterior de SDR for encontrado, envia `sdr_name = ""` (string vazia) para não confundir com o nome do closer.

## Mudança

Único ponto de alteração: a função `notify_status_change_webhook` (trigger SQL).

### Lógica atual
```
_sdr_lookup_id := COALESCE(NEW.sdr_responsavel_id, NEW.created_by);
SELECT full_name INTO _sdr_name FROM profiles WHERE user_id = _sdr_lookup_id;
```

Para 2ª reunião, `created_by` é o closer → `sdr_name` vira o nome do closer. Errado.

### Lógica nova
```sql
IF NEW.meeting_reason = 'segunda_reuniao' THEN
  -- Procura o primeiro agendamento do mesmo telefone criado por um SDR
  SELECT p.full_name INTO _sdr_name
  FROM agendamentos a
  JOIN user_roles ur ON ur.user_id = a.created_by AND ur.role = 'sdr'
  LEFT JOIN profiles p ON p.user_id = a.created_by
  WHERE a.deleted_at IS NULL
    AND a.id <> NEW.id
    AND regexp_replace(COALESCE(a.lead_phone,''), '\D', '', 'g')
        = regexp_replace(COALESCE(NEW.lead_phone,''), '\D', '', 'g')
  ORDER BY a.created_at ASC
  LIMIT 1;
  -- _sdr_name fica NULL se não achar → COALESCE(_sdr_name,'') envia ""
ELSE
  _sdr_lookup_id := COALESCE(NEW.sdr_responsavel_id, NEW.created_by);
  IF _sdr_lookup_id IS NOT NULL THEN
    SELECT full_name INTO _sdr_name FROM profiles WHERE user_id = _sdr_lookup_id;
  END IF;
END IF;
```

Os demais campos do payload (`closer_name`, `meet_link`, `calendar_link`, `scheduled_datetime`, `briefing`, `lead_name`, `lead_phone`, `created_at`, `meeting_reason`, `is_segunda_reuniao`, `channel_type`, `status`) **já são enviados hoje** pelo trigger — nada a mudar.

## Itens já atendidos (não exigem alteração)

- ✅ `channel_type` já é enviado no payload em todos os tipos de agendamento (INSERT, UPDATE de status, exclusão) — adicionado na migration anterior. Para 2ª reunião vem `"Segunda Reunião"`, para SDR vem o canal escolhido na UI.
- ✅ `meet_link` novo é gerado a cada 2ª reunião pelo `createGoogleCalendarEvent` (`src/pages/AgendarPage.tsx`).
- ✅ `calendar_link` já é construído no trigger para todo agendamento.
- ✅ `closer_name` continua sendo resolvido a partir de `NEW.closer_id`.

## Validação pós-deploy

1. Criar uma 2ª reunião como closer para um lead que já tem agendamento anterior de SDR → conferir no log da DataCrazy que o payload chega com:
   - `sdr_name` = nome do SDR original
   - `closer_name` = nome do closer atual
   - `is_segunda_reuniao: true`, `meeting_reason: "segunda_reuniao"`, `channel_type: "Segunda Reunião"`
   - `meet_link`, `calendar_link`, `scheduled_datetime` preenchidos
2. Criar uma 2ª reunião para um lead sem histórico de SDR → `sdr_name: ""`.
3. Criar um agendamento normal de SDR → `sdr_name` = SDR, `channel_type` = canal escolhido, `is_segunda_reuniao: false`.
