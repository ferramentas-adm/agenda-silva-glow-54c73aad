import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
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

    const { closer_id, date_start, date_end } = await req.json();

    if (!closer_id || !date_start || !date_end) {
      return new Response(JSON.stringify({ error: 'closer_id, date_start, date_end required' }), {
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
      return new Response(JSON.stringify({ connected: false, events: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired or will expire in 5 minutes
    const expiryDate = new Date(tokenData.token_expiry);
    const now = new Date();
    if (expiryDate.getTime() - now.getTime() < 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokenData.refresh_token);
      if (!refreshed) {
        return new Response(JSON.stringify({ connected: true, expired: true, events: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      await supabaseAdmin
        .from('closer_google_tokens')
        .update({ access_token: accessToken, token_expiry: newExpiry })
        .eq('closer_id', closer_id);
    }

    // Fetch events from Google Calendar
    const calendarId = tokenData.calendar_id || 'primary';
    const params = new URLSearchParams({
      timeMin: new Date(date_start).toISOString(),
      timeMax: new Date(date_end).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!calRes.ok) {
      const errBody = await calRes.text();
      console.error('Google Calendar API error:', calRes.status, errBody);
      return new Response(JSON.stringify({ connected: true, expired: calRes.status === 401, events: [], error: 'calendar_api_error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const calData = await calRes.json();

    const events = (calData.items || [])
      .filter((e: any) => e.status !== 'cancelled')
      // Exclude all-day events (they have date but no dateTime)
      .filter((e: any) => e.start?.dateTime && e.end?.dateTime)
      // Exclude events created by the system (pattern: "Grupo Silva")
      .filter((e: any) => !(e.summary && e.summary.toLowerCase().startsWith('grupo silva')))
      .map((e: any) => ({
        summary: e.summary || 'Sem título',
        start: e.start.dateTime,
        end: e.end.dateTime,
        status: e.status,
      }));

    return new Response(JSON.stringify({ connected: true, expired: false, events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
