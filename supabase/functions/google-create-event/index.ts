import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, x-client-info, apikey, content-type',
};

// Guarda o erro real do Google no refresh para virar rastro na auditoria.
let lastRefreshError: string | null = null;

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    lastRefreshError = `refresh_token [${res.status}]: ${JSON.stringify(data)}`;
    console.error('Token refresh failed:', data);
    return null;
  }
  lastRefreshError = null;
  return { access_token: data.access_token, expires_in: data.expires_in };
}

const MEET_SPACE_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created';

/**
 * Cria um espaço do Google Meet já configurado para iniciar gravação
 * (e transcrição, quando o plano permitir) automaticamente.
 *
 * Usado apenas para closers com `auto_recording_enabled = true` (piloto).
 * Qualquer falha retorna null — o chamador cai no fluxo padrão do Calendar.
 */
async function createAutoRecordingSpace(
  accessToken: string,
): Promise<{ uri: string; transcription: boolean } | null> {
  const attempts: Array<{ transcription: boolean; body: Record<string, unknown> }> = [
    {
      transcription: true,
      body: {
        config: {
          accessType: 'TRUSTED',
          entryPointAccess: 'ALL',
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: 'ON' },
            transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
          },
        },
      },
    },
    // Se o Google recusar a transcrição automática (depende do tier),
    // tenta novamente pedindo apenas a gravação.
    {
      transcription: false,
      body: {
        config: {
          accessType: 'TRUSTED',
          entryPointAccess: 'ALL',
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: 'ON' },
          },
        },
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      // v2 é a versão estável e a única publicada em meet.googleapis.com
      // (v2beta retorna 404 "Method not found"). O artifactConfig com
      // autoRecordingGeneration/autoTranscriptionGeneration existe na v2.
      const res = await fetch('https://meet.googleapis.com/v2/spaces', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(attempt.body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(
          `[auto-recording] Meet spaces.create falhou (transcription=${attempt.transcription}) [${res.status}]:`,
          errBody,
        );
        continue;
      }

      const data = await res.json();
      const uri: string | null = data.meetingUri ?? null;
      if (!uri) {
        console.error('[auto-recording] Meet spaces.create sem meetingUri:', JSON.stringify(data));
        continue;
      }
      return { uri, transcription: attempt.transcription };
    } catch (err) {
      console.error('[auto-recording] Erro na chamada da Meet API:', err);
    }
  }

  return null;
}

// ── Piloto "nome do lead no Meet" ──────────────────────────────────────────
// Closers nesta lista criam a reunião pelo fluxo nativo do Google Calendar
// (garante o título "Grupo Silva & <lead>" no Meet) e depois recebem a
// gravação/transcrição automática via PATCH no espaço do Meet.
// Qualquer falha no PATCH mantém o evento e o link intactos.
const TITULO_PILOTO_CLOSER_IDS = new Set<string>([
  '1d5aeff3-87d8-46c3-bdfd-8f815f8f25ef', // Vitor Lima
]);

/**
 * Liga gravação e transcrição automáticas em um espaço do Meet já existente
 * (criado pelo Google Calendar). Retorna o que conseguiu ligar.
 */
async function enableAutoArtifactsOnSpace(
  accessToken: string,
  meetingCode: string,
): Promise<{ recording: boolean; transcription: boolean; error: string | null }> {
  const attempts: Array<{ transcription: boolean; mask: string; body: Record<string, unknown> }> = [
    {
      transcription: true,
      mask: 'config.artifactConfig',
      body: {
        config: {
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: 'ON' },
            transcriptionConfig: { autoTranscriptionGeneration: 'ON' },
          },
        },
      },
    },
    {
      transcription: false,
      mask: 'config.artifactConfig.recordingConfig',
      body: {
        config: {
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: 'ON' },
          },
        },
      },
    },
  ];

  let lastError: string | null = null;

  for (const attempt of attempts) {
    try {
      const res = await fetch(
        `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetingCode)}?updateMask=${encodeURIComponent(attempt.mask)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(attempt.body),
        },
      );

      if (!res.ok) {
        lastError = `[${res.status}] ${await res.text()}`;
        console.error(
          `[titulo-piloto] PATCH do espaço falhou (transcription=${attempt.transcription}):`,
          lastError,
        );
        continue;
      }

      return { recording: true, transcription: attempt.transcription, error: null };
    } catch (err) {
      lastError = String(err);
      console.error('[titulo-piloto] Erro no PATCH do espaço do Meet:', err);
    }
  }

  return { recording: false, transcription: false, error: lastError };
}




serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const internalKey = req.headers.get("x-api-key");
    const expectedInternalKey = Deno.env.get("SDR_IA_API_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRoleRequest = Boolean(
      serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`,
    );
    const isInternalSdrRequest = Boolean(
      expectedInternalKey && internalKey && internalKey === expectedInternalKey,
    ) || isServiceRoleRequest;

    if (!isInternalSdrRequest && !authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let callerClaims: Record<string, unknown> | null = null;
    if (!isInternalSdrRequest) {
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader ?? "" } } }
      );

      const token = (authHeader ?? "").replace("Bearer ", "");
      const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
      if (claimsError || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerClaims = claims.claims as Record<string, unknown>;
    }

    const { closer_id, lead_name, lead_phone, sdr_name, scheduled_date, scheduled_time, duration_minutes } = await req.json();
    const durationMin = Number.isFinite(Number(duration_minutes)) && Number(duration_minutes) > 0 ? Number(duration_minutes) : 60;

    if (!closer_id || !lead_name || !scheduled_date || !scheduled_time) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Dados do closer (e-mail entra no rastro de erro) + flag do piloto de gravação.
    const { data: closerRow } = await supabaseAdmin
      .from('closers')
      .select('name, email, auto_recording_enabled')
      .eq('id', closer_id)
      .maybeSingle();
    const closerEmail: string | null = closerRow?.email ?? null;
    const closerName: string | null = closerRow?.name ?? null;

    // Nunca falhar em silêncio: toda falha do Calendar/Meet vira linha no audit log.
    async function logMeetFailure(motivo: string, erroGoogle: string | null) {
      console.error('[meet] falha ao criar evento/link', { motivo, closer_id, closerEmail, erroGoogle });
      try {
        let userId = callerClaims?.sub as string | undefined;
        let email = callerClaims?.email as string | undefined;
        if (isInternalSdrRequest) {
          const { data: sdrProfile } = await supabaseAdmin
            .from('profiles')
            .select('user_id, email')
            .eq('email', 'joao.amorim.ia@ogruposilva.com.br')
            .maybeSingle();
          userId = sdrProfile?.user_id ?? userId;
          email = sdrProfile?.email ?? email;
        }
        await supabaseAdmin.from('audit_logs').insert({
          user_id: userId ?? '00000000-0000-0000-0000-000000000000',
          user_name: email ?? (isInternalSdrRequest ? 'João Amorim' : 'Sistema'),
          user_email: email ?? null,
          action: 'meet_link_falhou',
          entity_type: 'agendamento',
          entity_id: null,
          details: {
            lead_name,
            closer_id,
            closer_name: closerName,
            closer_email: closerEmail,
            scheduled_date,
            scheduled_time,
            motivo,
            erro_google: erroGoogle,
          },
        });
      } catch (logErr) {
        console.error('[meet] falha ao registrar auditoria da falha:', logErr);
      }
    }

    const failure = async (error: string, details: string | null, motivoLegivel: string) => {
      await logMeetFailure(error, details);
      return new Response(JSON.stringify({
        success: false,
        error,
        details,
        motivo: motivoLegivel,
        closer_email: closerEmail,
        closer_name: closerName,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    };

    // Get token for closer
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('closer_google_tokens')
      .select('*')
      .eq('closer_id', closer_id)
      .single();

    if (tokenError || !tokenData) {
      return await failure(
        'google_not_connected',
        tokenError?.message ?? 'nenhum token do Google salvo para este closer',
        `Agenda Google de ${closerName ?? 'closer'} (${closerEmail ?? 'sem e-mail'}) nunca foi conectada`,
      );
    }

    let accessToken = tokenData.access_token;

    // Refresh if expired
    const expiryDate = new Date(tokenData.token_expiry);
    if (expiryDate.getTime() - Date.now() < 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokenData.refresh_token);
      if (!refreshed) {
        return await failure(
          'token_expired',
          lastRefreshError,
          `Acesso Google de ${closerName ?? 'closer'} (${closerEmail ?? 'sem e-mail'}) expirou e precisa ser reconectado`,
        );
      }
      accessToken = refreshed.access_token;
      await supabaseAdmin
        .from('closer_google_tokens')
        .update({
          access_token: accessToken,
          token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq('closer_id', closer_id);
    }

    // Build event — use proper offset for America/Sao_Paulo (-03:00)
    // Compute end = start + 1 hour, handling day rollover (e.g. 23:00 -> next day 00:00)
    const startDateTime = `${scheduled_date}T${scheduled_time}:00-03:00`;
    const startMs = new Date(startDateTime).getTime();
    const endMs = startMs + durationMin * 60 * 1000;
    const endDate = new Date(endMs);
    // Format as local -03:00 wall clock
    const pad = (n: number) => String(n).padStart(2, '0');
    // Convert to São Paulo offset manually: endMs is absolute; -03:00 means add -3h offset to UTC components
    const spOffsetMs = -3 * 60 * 60 * 1000;
    const sp = new Date(endMs + spOffsetMs); // shift so UTC getters return SP wall time
    const endDateStr = `${sp.getUTCFullYear()}-${pad(sp.getUTCMonth() + 1)}-${pad(sp.getUTCDate())}`;
    const endTimeStr = `${pad(sp.getUTCHours())}:${pad(sp.getUTCMinutes())}`;
    const endDateTime = `${endDateStr}T${endTimeStr}:00-03:00`;

    // ── Piloto de gravação automática ──────────────────────────────────────
    // Só entra neste caminho quando o closer tem a flag ligada E o token dele
    // contém o escopo do Meet. Qualquer falha cai no fluxo padrão do Calendar.
    let autoSpace: { uri: string; transcription: boolean } | null = null;
    let autoRecordingMode: 'auto' | 'fallback' | 'off' = 'off';
    const temEscopoMeet = ((tokenData.granted_scopes ?? '') as string).includes(MEET_SPACE_SCOPE);
    // Piloto do título: cria a sala pelo próprio Calendar (nome do lead) e liga
    // gravação depois, sem usar sala avulsa do Meet.
    const tituloPiloto = closerRow?.auto_recording_enabled === true
      && temEscopoMeet
      && TITULO_PILOTO_CLOSER_IDS.has(String(closer_id));

    if (closerRow?.auto_recording_enabled === true && !tituloPiloto) {
      if (temEscopoMeet) {
        autoSpace = await createAutoRecordingSpace(accessToken);
        autoRecordingMode = autoSpace ? 'auto' : 'fallback';
      } else {
        console.warn('[auto-recording] closer sem escopo do Meet — usando fluxo padrão:', closer_id);
        autoRecordingMode = 'fallback';
      }
    }


    const description = [
      `Lead: ${lead_name}`,
      lead_phone ? `Telefone: ${lead_phone}` : '',
      sdr_name ? `SDR: ${sdr_name}` : '',
      autoSpace
        ? `\nLink da reunião: ${autoSpace.uri}\n(Gravação${autoSpace.transcription ? ' e transcrição' : ''} automática ativada)`
        : '',
    ].filter(Boolean).join('\n');

    const event: Record<string, unknown> = {
      summary: `Grupo Silva & ${lead_name}`,
      description,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Sao_Paulo',
      },
    };

    if (autoSpace) {
      // Vincula a sala já criada (com gravação automática) ao bloco oficial de
      // videoconferência do evento. Sem isso o Meet trata a sala como avulsa do
      // closer e mostra o nome dele no saguão/aba em vez do título do evento.
      const meetingCode = autoSpace.uri.split('/').filter(Boolean).pop() ?? '';
      event.location = autoSpace.uri;
      event.conferenceData = {
        conferenceId: meetingCode,
        conferenceSolution: {
          key: { type: 'hangoutsMeet' },
          name: 'Google Meet',
        },
        entryPoints: [
          {
            entryPointType: 'video',
            uri: autoSpace.uri,
            label: autoSpace.uri.replace(/^https?:\/\//, ''),
          },
        ],
      };
    } else {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const calendarId = tokenData.calendar_id || 'primary';
    const insertEvent = (body: Record<string, unknown>) => fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    let calRes = await insertEvent(event);

    // Se o Google recusar o vínculo explícito da sala, cria o evento só com o
    // link no local — o agendamento nunca deixa de ser criado.
    if (!calRes.ok && autoSpace) {
      const errBody = await calRes.text();
      console.error('[auto-recording] insert com conferenceData falhou, tentando fallback:', errBody);
      const { conferenceData: _drop, ...fallbackEvent } = event as Record<string, unknown>;
      calRes = await insertEvent(fallbackEvent);
    }


    if (!calRes.ok) {
      const errBody = await calRes.text();
      return await failure(
        'calendar_api_error',
        `[${calRes.status}] ${errBody}`,
        `Google recusou criar o evento na agenda de ${closerName ?? 'closer'} (${closerEmail ?? 'sem e-mail'})`,
      );
    }

    const calData = await calRes.json();
    const meetLink = autoSpace?.uri
      || calData.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === 'video'
      )?.uri
      || calData.hangoutLink
      || null;

    // Evento criado, mas sem link: também é falha e precisa de rastro.
    if (!meetLink) {
      await logMeetFailure(
        'sem_link_no_evento',
        `evento ${calData.id ?? '?'} criado sem conferenceData/hangoutLink`,
      );
    }

    // Piloto do título: o evento já nasceu com a sala do próprio Calendar
    // (nome do lead preservado). Agora liga gravação/transcrição na sala.
    let tituloPilotoResultado: { recording: boolean; transcription: boolean; error: string | null } | null = null;
    if (tituloPiloto && meetLink) {
      const meetingCode = String(meetLink).split('/').filter(Boolean).pop() ?? '';
      tituloPilotoResultado = await enableAutoArtifactsOnSpace(accessToken, meetingCode);
      autoRecordingMode = tituloPilotoResultado.recording ? 'auto' : 'fallback';
      if (!tituloPilotoResultado.recording) {
        await logMeetFailure(
          'auto_gravacao_patch_falhou',
          tituloPilotoResultado.error ?? 'PATCH do espaço do Meet não retornou sucesso',
        );
      }
    }


    // Auditoria do piloto: registra se o agendamento saiu no modo automático
    // ou caiu no fallback, para medir a taxa de sucesso.
    if (autoRecordingMode !== 'off') {
      try {
        let userId = callerClaims?.sub as string | undefined;
        let email = callerClaims?.email as string | undefined;
        if (isInternalSdrRequest) {
          const { data: sdrProfile } = await supabaseAdmin
            .from('profiles')
            .select('user_id, email')
            .eq('email', 'joao.amorim.ia@ogruposilva.com.br')
            .maybeSingle();
          userId = sdrProfile?.user_id ?? userId;
          email = sdrProfile?.email ?? email;
        }
        await supabaseAdmin.from('audit_logs').insert({
          user_id: userId ?? '00000000-0000-0000-0000-000000000000',
          user_name: email ?? (isInternalSdrRequest ? 'João Amorim' : 'Sistema'),
          user_email: email ?? (isInternalSdrRequest ? 'joao.amorim.ia@ogruposilva.com.br' : null),
          action: 'meet_auto_recording',
          entity_type: 'agendamento',
          entity_id: calData.id ?? null,
          details: {
            lead_name,
            closer_id,
            mode: autoRecordingMode,
            transcription: tituloPilotoResultado?.transcription ?? autoSpace?.transcription ?? false,
            fluxo: tituloPiloto ? 'calendar_nativo_patch_meet' : 'meet_space_avulso',
            patch_erro: tituloPilotoResultado?.error ?? null,
          },

        });
      } catch (logErr) {
        console.error('[auto-recording] falha ao registrar auditoria:', logErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      meet_link: meetLink,
      event_id: calData.id,
      closer_email: closerEmail,
      closer_name: closerName,
      error: meetLink ? null : 'sem_link_no_evento',
      motivo: meetLink ? null : `Evento criado na agenda de ${closerName ?? 'closer'}, mas o Google não devolveu link do Meet`,
      auto_recording: autoRecordingMode === 'auto',
      auto_transcription: tituloPilotoResultado?.transcription ?? autoSpace?.transcription ?? false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error creating calendar event:', error);
    return new Response(JSON.stringify({ success: false, error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
