CREATE OR REPLACE FUNCTION public.notify_status_change_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _status_display TEXT;
  _payload JSONB;
  _closer_name TEXT;
  _sdr_name TEXT;
  _sdr_lookup_id UUID;
  _calendar_link TEXT;
  _start_dt TEXT;
  _end_dt TEXT;
  _scheduled_iso TEXT;
  _created_iso TEXT;
  _is_deletion BOOLEAN := FALSE;
  _is_assignment BOOLEAN := FALSE;
  _is_late_meet BOOLEAN := FALSE;
  _is_segunda BOOLEAN;
  _origin_venda RECORD;
  _origin_pagamento RECORD;
  _lead_revenue TEXT := NULL;
  _motivo_nao_fechamento TEXT := NULL;
  _explicacao_nao_fechamento TEXT := NULL;
  _valor_apresentado NUMERIC := NULL;
  _recebimento_acordado BOOLEAN := FALSE;
  _valor_previsto NUMERIC := NULL;
  _data_prevista DATE := NULL;
  _current_venda RECORD;
  _is_vendido BOOLEAN := NULL;
  _is_follow_up BOOLEAN := NULL;
  _is_perdido BOOLEAN := NULL;
  _vendeu BOOLEAN := NULL;
  _valor_coletado TEXT := NULL;
  _resumo_venda TEXT := NULL;
  _follow_up_date DATE := NULL;
  _follow_up_time TEXT := NULL;
  _observacoes TEXT := NULL;
  _cancel_reason TEXT := NULL;
  _reason_norm TEXT := NULL;
  _bucket TEXT := NULL;
  _cancel_reasons TEXT[] := ARRAY[
    'cancelou por desistência',
    'cancelou por imprevisto pessoal',
    'sem closer disponível',
    'alterou horário para o mesmo dia'
  ];
  _webhook_url TEXT := 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/1e5d35d1-ce8e-4f54-8f77-a2a5073cbe5c/090af1d1-0253-4445-b6b4-4eb2b2f6c3c6';
BEGIN
  IF NEW.closer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_venda_avulsa, FALSE) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.closer_id IS NULL AND NEW.closer_id IS NOT NULL THEN
      _is_assignment := TRUE;
    ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      _is_deletion := TRUE;
    ELSIF OLD.status IS NOT DISTINCT FROM NEW.status
          AND OLD.meet_link IS NOT DISTINCT FROM NEW.meet_link THEN
      RETURN NEW;
    ELSIF OLD.meet_link IS DISTINCT FROM NEW.meet_link
          AND NULLIF(btrim(COALESCE(NEW.meet_link, '')), '') IS NOT NULL THEN
      _is_late_meet := TRUE;
    ELSIF NEW.status NOT IN ('agendada', 'realizada', 'cancelada', 'no_show', 'confirmada', 'reagendada') THEN
      RETURN NEW;
    END IF;
  END IF;

  _scheduled_iso := NEW.scheduled_date::text || 'T' || NEW.scheduled_time || ':00-03:00';
  _created_iso := to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  _is_segunda := (NEW.meeting_reason = 'segunda_reuniao');

  SELECT name INTO _closer_name FROM public.closers WHERE id = NEW.closer_id;

  IF _is_segunda THEN
    SELECT p.full_name INTO _sdr_name
    FROM public.agendamentos a
    JOIN public.user_roles ur
      ON ur.user_id = a.created_by AND ur.role = 'sdr'::app_role
    LEFT JOIN public.profiles p ON p.user_id = a.created_by
    WHERE a.deleted_at IS NULL
      AND a.id <> NEW.id
      AND regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g')
          = regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g')
      AND regexp_replace(COALESCE(NEW.lead_phone, ''), '\D', '', 'g') <> ''
    ORDER BY a.created_at ASC
    LIMIT 1;

    IF _sdr_name IS NULL OR _sdr_name = '' THEN
      _sdr_lookup_id := COALESCE(NEW.sdr_responsavel_id, NEW.created_by);
      IF _sdr_lookup_id IS NOT NULL THEN
        SELECT full_name INTO _sdr_name FROM public.profiles WHERE user_id = _sdr_lookup_id;
      END IF;
    END IF;
  ELSE
    _sdr_lookup_id := COALESCE(NEW.sdr_responsavel_id, NEW.created_by);
    IF _sdr_lookup_id IS NOT NULL THEN
      SELECT full_name INTO _sdr_name FROM public.profiles WHERE user_id = _sdr_lookup_id;
    END IF;
  END IF;

  _start_dt := replace(NEW.scheduled_date::text, '-', '') || 'T' || replace(NEW.scheduled_time, ':', '') || '00';
  _end_dt := replace(NEW.scheduled_date::text, '-', '') || 'T' || lpad(((split_part(NEW.scheduled_time, ':', 1)::int + 1)::text), 2, '0') || split_part(NEW.scheduled_time, ':', 2) || '00';
  _calendar_link := 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    || '&text=' || replace(replace('Grupo Silva & ' || NEW.lead_name, ' ', '+'), '&', '%26')
    || '&dates=' || _start_dt || '/' || _end_dt
    || '&ctz=America/Sao_Paulo';

  IF TG_OP = 'INSERT' AND _is_segunda AND NEW.original_agendamento_id IS NOT NULL THEN
    SELECT v.lead_revenue, v.motivo_nao_fechamento, v.explicacao_nao_fechamento, v.valor
      INTO _origin_venda
    FROM public.vendas v WHERE v.agendamento_id = NEW.original_agendamento_id LIMIT 1;
    IF FOUND THEN
      _lead_revenue := _origin_venda.lead_revenue;
      _motivo_nao_fechamento := _origin_venda.motivo_nao_fechamento;
      _explicacao_nao_fechamento := _origin_venda.explicacao_nao_fechamento;
      _valor_apresentado := _origin_venda.valor;
    END IF;
    SELECT pg.valor_previsto, pg.data_prevista INTO _origin_pagamento
    FROM public.pagamentos pg WHERE pg.agendamento_id = NEW.original_agendamento_id
    ORDER BY pg.created_at DESC LIMIT 1;
    IF FOUND AND _origin_pagamento.valor_previsto IS NOT NULL THEN
      _recebimento_acordado := TRUE;
      _valor_previsto := _origin_pagamento.valor_previsto;
      _data_prevista := _origin_pagamento.data_prevista;
    END IF;
  END IF;

  IF NEW.status = 'realizada' AND NOT _is_deletion THEN
    SELECT v.vendeu, v.valor, v.resumo_venda, v.motivo_nao_fechamento, v.explicacao_nao_fechamento,
           v.lead_revenue, v.follow_up, v.follow_up_date, v.follow_up_time, v.segunda_reuniao, v.observacoes
      INTO _current_venda
    FROM public.vendas v WHERE v.agendamento_id = NEW.id LIMIT 1;
    IF FOUND THEN
      IF _current_venda.vendeu THEN _is_vendido := TRUE;
      ELSIF _current_venda.follow_up THEN _is_follow_up := TRUE;
      ELSIF NOT COALESCE(_current_venda.segunda_reuniao, FALSE)
            AND _current_venda.motivo_nao_fechamento IS NOT NULL
            AND _current_venda.motivo_nao_fechamento NOT IN ('Aguardando o pagamento', 'Analisando o contrato') THEN
        _is_perdido := TRUE;
      END IF;
      _vendeu := _current_venda.vendeu;
      _resumo_venda := _current_venda.resumo_venda;
      _motivo_nao_fechamento := _current_venda.motivo_nao_fechamento;
      _explicacao_nao_fechamento := _current_venda.explicacao_nao_fechamento;
      _lead_revenue := _current_venda.lead_revenue;
      _follow_up_date := _current_venda.follow_up_date;
      _follow_up_time := _current_venda.follow_up_time;
      _observacoes := _current_venda.observacoes;
      IF _current_venda.vendeu THEN
        _valor_coletado := regexp_replace(
          replace(to_char(_current_venda.valor, 'FM999999999999.00'), '.', ','),
          '(\d)(?=(\d{3})+(?!\d))', '\1.', 'g'
        );
      ELSE
        _valor_apresentado := _current_venda.valor;
      END IF;
    END IF;
  END IF;

  IF NOT _is_deletion AND NEW.status IN ('no_show', 'cancelada') THEN
    _cancel_reason := NULLIF(btrim(COALESCE(NEW.cancellation_reason, '')), '');
    _reason_norm := lower(_cancel_reason);
    IF _reason_norm IS NULL THEN
      _bucket := CASE WHEN NEW.status = 'cancelada' THEN 'cancelada' ELSE 'no_show' END;
    ELSIF _reason_norm = ANY (_cancel_reasons) THEN
      _bucket := 'cancelada';
    ELSE
      _bucket := 'no_show';
    END IF;
  END IF;

  IF _is_deletion THEN
    _status_display := 'Excluída';
  ELSIF NEW.status IN ('no_show', 'cancelada') THEN
    _status_display := CASE WHEN _bucket = 'cancelada' THEN 'Cancelar' ELSE 'No-show' END;
  ELSE
    CASE NEW.status
      WHEN 'agendada' THEN _status_display := 'Agendado';
      WHEN 'realizada' THEN _status_display := 'Realizada';
      WHEN 'confirmada' THEN _status_display := 'Confirmada';
      WHEN 'reagendada' THEN _status_display := 'Reagendada';
      ELSE _status_display := NEW.status::text;
    END CASE;
  END IF;

  _payload := jsonb_build_object(
    'evento', CASE WHEN _is_late_meet THEN 'meet_link_disponivel' ELSE 'status_agendamento' END,
    'mensagem', CASE WHEN _is_late_meet THEN 'Segue o link da sua reunião: ' || NEW.meet_link ELSE NULL END,
    'lead_name', NEW.lead_name,
    'lead_phone', NEW.lead_phone,
    'status', _status_display,
    'scheduled_datetime', _scheduled_iso,
    'created_at', _created_iso,
    'sdr_name', COALESCE(_sdr_name, ''),
    'closer_name', COALESCE(_closer_name, ''),
    'briefing', COALESCE(NEW.briefing, ''),
    'meeting_reason', COALESCE(NEW.meeting_reason, ''),
    'is_segunda_reuniao', _is_segunda,
    'is_vendido', _is_vendido,
    'is_follow_up', _is_follow_up,
    'is_perdido', _is_perdido,
    'channel_type', COALESCE(NEW.channel_type, ''),
    'meet_link', COALESCE(NULLIF(NEW.meet_link, ''), NULL),
    'calendar_link', _calendar_link,
    'deleted_at', CASE WHEN _is_deletion THEN to_char(NEW.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') ELSE NULL END,
    'deletion_reason', CASE WHEN _is_deletion THEN COALESCE(NEW.deletion_reason, '') ELSE NULL END,
    'cancellation_reason', _cancel_reason,
    'nao_comparecimento_bucket', _bucket,
    'lead_revenue', _lead_revenue,
    'vendeu', _vendeu,
    'valor_coletado', _valor_coletado,
    'resumo_venda', _resumo_venda,
    'motivo_nao_fechamento', _motivo_nao_fechamento,
    'explicacao_nao_fechamento', _explicacao_nao_fechamento,
    'valor_apresentado', _valor_apresentado,
    'follow_up_date', _follow_up_date,
    'follow_up_time', _follow_up_time,
    'observacoes', _observacoes,
    'recebimento_acordado', _recebimento_acordado,
    'valor_previsto', _valor_previsto,
    'data_prevista', _data_prevista
  );

  PERFORM net.http_post(
    url := _webhook_url,
    body := _payload,
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN NEW;
END;
$function$;