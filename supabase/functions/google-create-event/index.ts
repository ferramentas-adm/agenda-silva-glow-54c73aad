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

    // Get token for closer
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('closer_google_tokens')
      .select('*')
      .eq('closer_id', closer_id)
      .single();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ success: false, error: 'google_not_connected' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = tokenData.access_token;

    // Refresh if expired
    const expiryDate = new Date(tokenData.token_expiry);
    if (expiryDate.getTime() - Date.now() < 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokenData.refresh_token);
      if (!refreshed) {
        return new Response(JSON.stringify({ success: false, error: 'token_expired' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

    const { data: closerRow } = await supabaseAdmin
      .from('closers')
      .select('auto_recording_enabled')
      .eq('id', closer_id)
      .maybeSingle();

    if (closerRow?.auto_recording_enabled === true) {
      const scopes = (tokenData.granted_scopes ?? '') as string;
      if (scopes.includes(MEET_SPACE_SCOPE)) {
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
      // Reutiliza a sala já criada com gravação automática.
      event.location = autoSpace.uri;
    } else {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const calendarId = tokenData.calendar_id || 'primary';
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      },
    );

    if (!calRes.ok) {
      const errBody = await calRes.text();
      console.error('Google Calendar create event error:', calRes.status, errBody);
      return new Response(JSON.stringify({ success: false, error: 'calendar_api_error', details: errBody }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const calData = await calRes.json();
    const meetLink = autoSpace?.uri
      || calData.conferenceData?.entryPoints?.find(
        (ep: any) => ep.entryPointType === 'video'
      )?.uri
      || calData.hangoutLink
      || null;

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
            transcription: autoSpace?.transcription ?? false,
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
      auto_recording: autoRecordingMode === 'auto',
      auto_transcription: autoSpace?.transcription ?? false,
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
