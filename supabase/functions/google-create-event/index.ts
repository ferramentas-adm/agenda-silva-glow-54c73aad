import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error('Token refresh failed:', data);
    return null;
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const description = [
      `Lead: ${lead_name}`,
      lead_phone ? `Telefone: ${lead_phone}` : '',
      sdr_name ? `SDR: ${sdr_name}` : '',
    ].filter(Boolean).join('\n');

    const event = {
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
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

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
    const meetLink = calData.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video'
    )?.uri || calData.hangoutLink || null;

    return new Response(JSON.stringify({
      success: true,
      meet_link: meetLink,
      event_id: calData.id,
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
