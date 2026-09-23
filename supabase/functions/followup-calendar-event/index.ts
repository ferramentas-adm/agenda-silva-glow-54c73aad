// Cria (ou atualiza) o compromisso de follow-up na agenda corporativa do closer.
// Não cria link de Meet: é um lembrete de ligação/WhatsApp.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-api-key, x-client-info, apikey, content-type",
};

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) return null;
  return { access_token: data.access_token as string, expires_in: Number(data.expires_in) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      closer_id,
      lead_name,
      lead_phone,
      canal,
      data: dateStr,
      hora,
      produto,
      valor,
      condicoes,
      temperatura,
      tentativa,
      existing_event_id,
    } = body ?? {};

    if (!closer_id || !lead_name || !dateStr || !hora) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenData } = await admin
      .from("closer_google_tokens")
      .select("*")
      .eq("closer_id", closer_id)
      .maybeSingle();

    if (!tokenData) {
      return new Response(
        JSON.stringify({ success: false, error: "google_not_connected", motivo: "Agenda Google do closer não está conectada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let accessToken = tokenData.access_token as string;
    if (new Date(tokenData.token_expiry).getTime() - Date.now() < 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokenData.refresh_token as string);
      if (!refreshed) {
        return new Response(
          JSON.stringify({ success: false, error: "token_expired", motivo: "Acesso Google do closer expirou" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      accessToken = refreshed.access_token;
      await admin
        .from("closer_google_tokens")
        .update({
          access_token: accessToken,
          token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        })
        .eq("closer_id", closer_id);
    }

    const startDateTime = `${dateStr}T${hora}:00-03:00`;
    const endMs = new Date(startDateTime).getTime() + 30 * 60 * 1000;
    const pad = (n: number) => String(n).padStart(2, "0");
    const sp = new Date(endMs - 3 * 60 * 60 * 1000);
    const endDateTime = `${sp.getUTCFullYear()}-${pad(sp.getUTCMonth() + 1)}-${pad(sp.getUTCDate())}T${pad(sp.getUTCHours())}:${pad(sp.getUTCMinutes())}:00-03:00`;

    const canalLabel = canal === "whatsapp" ? "WhatsApp" : canal === "ligacao" ? "Ligação" : "Contato";
    const description = [
      `Follow-up${tentativa ? ` (tentativa ${tentativa}/3)` : ""} — ${canalLabel}`,
      lead_phone ? `Telefone: ${lead_phone}` : "",
      produto ? `Produto: ${produto}` : "",
      valor ? `Valor combinado: R$ ${valor}` : "",
      temperatura ? `Temperatura: ${temperatura}` : "",
      condicoes ? `\nCondições da negociação:\n${condicoes}` : "",
    ].filter(Boolean).join("\n");

    const event = {
      summary: `Follow-up ${canalLabel} — ${lead_name}`,
      description,
      start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
      end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 60 },
          { method: "popup", minutes: 30 },
          { method: "popup", minutes: 10 },
        ],
      },
    };

    const calendarId = encodeURIComponent((tokenData.calendar_id as string) || "primary");
    const url = existing_event_id
      ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${existing_event_id}`
      : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

    const res = await fetch(url, {
      method: existing_event_id ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[followup-calendar] falhou [${res.status}]: ${errBody}`);
      return new Response(
        JSON.stringify({ success: false, error: "calendar_api_error", status: res.status, details: errBody }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const created = await res.json();
    return new Response(
      JSON.stringify({ success: true, event_id: created.id, html_link: created.htmlLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[followup-calendar] erro inesperado:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
