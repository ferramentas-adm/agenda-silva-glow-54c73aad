import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
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
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("Token refresh failed:", data);
    return null;
  }
  return { access_token: data.access_token, expires_in: data.expires_in };
}

async function getValidAccessToken(supabaseAdmin: any, closerId: string): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data: tokenData, error } = await supabaseAdmin
    .from("closer_google_tokens")
    .select("*")
    .eq("closer_id", closerId)
    .single();
  if (error || !tokenData) return null;

  let accessToken = tokenData.access_token;
  const expiry = new Date(tokenData.token_expiry).getTime();
  if (expiry - Date.now() < 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokenData.refresh_token);
    if (!refreshed) return null;
    accessToken = refreshed.access_token;
    await supabaseAdmin
      .from("closer_google_tokens")
      .update({
        access_token: accessToken,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("closer_id", closerId);
  }
  return { accessToken, calendarId: tokenData.calendar_id || "primary" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { agendamento_id, new_closer_id } = await req.json();
    if (!agendamento_id || !new_closer_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch agendamento
    const { data: ag, error: agErr } = await supabaseAdmin
      .from("agendamentos")
      .select("id, lead_name, lead_phone, scheduled_date, scheduled_time, duration_minutes, closer_id, google_event_id, meet_link, status, created_by, sdr_responsavel_id")
      .eq("id", agendamento_id)
      .single();
    if (agErr || !ag) {
      return new Response(JSON.stringify({ success: false, error: "agendamento_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (ag.closer_id === new_closer_id) {
      return new Response(JSON.stringify({ success: true, meet_link: ag.meet_link, warnings: ["same_closer"] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const oldCloserId = ag.closer_id;
    const warnings: string[] = [];
    const finalizedStatuses = ["realizada", "cancelada", "no_show", "reagendada"];
    const skipGoogle = finalizedStatuses.includes(ag.status);

    const userId = claims.claims.sub as string | undefined;
    const userEmail = (claims.claims.email as string | undefined)?.toLowerCase() ?? "";
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: roleRows }, { data: profileRow }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("profiles").select("moderador_tipo").eq("user_id", userId).maybeSingle(),
    ]);
    const roles = new Set<string>((roleRows ?? []).map((r: any) => String(r.role)));
    let isCloserOwner = false;
    if (roles.has("closer") && oldCloserId && userEmail) {
      const { data: closerRow } = await supabaseAdmin
        .from("closers")
        .select("id")
        .eq("id", oldCloserId)
        .ilike("email", userEmail)
        .maybeSingle();
      isCloserOwner = !!closerRow;
    }
    const canTransfer =
      roles.has("gestor") ||
      roles.has("supervisor") ||
      (roles.has("moderador") && (profileRow?.moderador_tipo ?? null) === "sdr") ||
      isCloserOwner;
    if (!canTransfer) {
      return new Response(JSON.stringify({ success: false, error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve SDR name (best-effort) for description
    let sdrName = "";
    const sdrId = ag.sdr_responsavel_id || ag.created_by;
    if (sdrId) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("user_id", sdrId).maybeSingle();
      sdrName = prof?.full_name || "";
    }

    let newMeetLink: string | null = null;
    let newEventId: string | null = null;

    if (!skipGoogle) {
      // 1) Create event on new closer's calendar (if connected)
      const newAuth = await getValidAccessToken(supabaseAdmin, new_closer_id);
      if (!newAuth) {
        warnings.push("new_closer_not_connected");
      } else {
        const durationMin = Number.isFinite(Number(ag.duration_minutes)) && Number(ag.duration_minutes) > 0
          ? Number(ag.duration_minutes) : 60;
        const startDateTime = `${ag.scheduled_date}T${ag.scheduled_time}:00-03:00`;
        const startMs = new Date(startDateTime).getTime();
        const endMs = startMs + durationMin * 60 * 1000;
        const pad = (n: number) => String(n).padStart(2, "0");
        const spOffsetMs = -3 * 60 * 60 * 1000;
        const sp = new Date(endMs + spOffsetMs);
        const endDateStr = `${sp.getUTCFullYear()}-${pad(sp.getUTCMonth() + 1)}-${pad(sp.getUTCDate())}`;
        const endTimeStr = `${pad(sp.getUTCHours())}:${pad(sp.getUTCMinutes())}`;
        const endDateTime = `${endDateStr}T${endTimeStr}:00-03:00`;

        const description = [
          `Lead: ${ag.lead_name}`,
          ag.lead_phone ? `Telefone: ${ag.lead_phone}` : "",
          sdrName ? `SDR: ${sdrName}` : "",
        ].filter(Boolean).join("\n");

        const event = {
          summary: `Grupo Silva & ${ag.lead_name}`,
          description,
          start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
          end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
        };

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(newAuth.calendarId)}/events?conferenceDataVersion=1`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${newAuth.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(event),
          }
        );
        if (!calRes.ok) {
          const errBody = await calRes.text();
          console.error("Create event on new closer failed:", calRes.status, errBody);
          warnings.push("create_event_failed");
        } else {
          const calData = await calRes.json();
          newMeetLink = calData.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri
            || calData.hangoutLink || null;
          newEventId = calData.id || null;
        }
      }

      // 2) Delete event on old closer's calendar (best-effort)
      if (ag.google_event_id && oldCloserId) {
        const oldAuth = await getValidAccessToken(supabaseAdmin, oldCloserId);
        if (!oldAuth) {
          warnings.push("old_closer_token_unavailable");
        } else {
          const delRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(oldAuth.calendarId)}/events/${encodeURIComponent(ag.google_event_id)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${oldAuth.accessToken}` } }
          );
          if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
            const errBody = await delRes.text();
            console.error("Delete old event failed:", delRes.status, errBody);
            warnings.push("delete_old_event_failed");
          }
        }
      }
    } else {
      warnings.push("skipped_google_finalized_status");
    }

    // 3) Update agendamento
    const updatePayload: Record<string, unknown> = { closer_id: new_closer_id };
    if (!skipGoogle) {
      updatePayload.meet_link = newMeetLink;
      updatePayload.google_event_id = newEventId;
    }
    const { error: updErr } = await supabaseAdmin
      .from("agendamentos")
      .update(updatePayload)
      .eq("id", agendamento_id);
    if (updErr) {
      console.error("Failed to update agendamento:", updErr);
      return new Response(JSON.stringify({ success: false, error: "update_failed", warnings }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      meet_link: newMeetLink,
      old_meet_link: ag.meet_link,
      warnings,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error transferring event:", error);
    return new Response(JSON.stringify({ success: false, error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
