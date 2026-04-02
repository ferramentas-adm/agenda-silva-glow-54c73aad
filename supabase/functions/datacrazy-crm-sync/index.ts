import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBHOOK_PATH_FRAGMENT = "/api/crm/flows/webhooks/";

function normalizeDataCrazyApiUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { throw new Error("DATACRAZY_API_URL is not a valid URL"); }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname.includes(WEBHOOK_PATH_FRAGMENT)) {
    const [basePath] = pathname.split(WEBHOOK_PATH_FRAGMENT);
    return `${parsed.origin}${basePath}`;
  }

  const resourceSegments = new Set(["leads", "businesses", "tags", "lists", "pipelines", "stages", "activities"]);
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);
  if (lastSegment && resourceSegments.has(lastSegment)) segments.pop();
  if (segments.length === 0) return `${parsed.origin}/api/v1`;
  return `${parsed.origin}/${segments.join("/")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const record = body.record;

    if (!record) {
      return new Response(JSON.stringify({ error: "No record provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase admin client
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const datacrazyApiUrl = normalizeDataCrazyApiUrl(Deno.env.get("DATACRAZY_API_URL")!);
    const datacrazyToken = Deno.env.get("DATACRAZY_API_TOKEN")!;

    // Load app settings
    const { data: settings } = await supabase.from("app_settings").select("key, value");
    const cfg: Record<string, string> = {};
    (settings ?? []).forEach((s: any) => { cfg[s.key] = s.value; });

    // Resolve closer info
    let closerDcId: string | null = null;
    let closerName = "";
    if (record.closer_id) {
      const { data: c } = await supabase.from("closers").select("datacrazy_id, name").eq("id", record.closer_id).single();
      closerDcId = c?.datacrazy_id || null;
      closerName = c?.name || "";
    }

    if (!closerDcId) {
      console.log("Closer has no datacrazy_id — skipping CRM sync");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve SDR / creator info
    let sdrDcId: string | null = null;
    let sdrName = "";
    if (record.created_by) {
      const { data: p } = await supabase.from("profiles").select("datacrazy_id, full_name").eq("user_id", record.created_by).single();
      sdrDcId = p?.datacrazy_id || null;
      sdrName = p?.full_name || "";
    }

    // ─── DataCrazy API helper ───────────────────────────────────
    async function dcApi(method: string, path: string, payload?: unknown) {
      const url = `${datacrazyApiUrl}${path.startsWith("/") ? path : `/${path}`}`;
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json", Authorization: datacrazyToken },
      };
      if (payload && method !== "GET") opts.body = JSON.stringify(payload);

      let res = await fetch(url, opts);

      // g1 fallback on 404
      if (res.status === 404 && url.includes("api.datacrazy.io")) {
        const g1Url = url.replace("api.datacrazy.io", "api.g1.datacrazy.io");
        res = await fetch(g1Url, opts);
      }

      if (!res.ok) throw new Error(`DataCrazy ${method} ${path}: ${res.status}`);
      return res.json();
    }

    const stageId = cfg["datacrazy_stage_reuniao_agendada"] || "";

    // Step 1: Find lead by phone
    const leadData = await dcApi("GET", `/leads?search=${encodeURIComponent(record.lead_phone)}`);
    const leads = leadData?.data || leadData || [];
    if (leads.length === 0) {
      console.warn("Lead not found:", record.lead_phone);
      return new Response(JSON.stringify({ error: "lead_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const lead = leads[0];

    // Step 2: Find or create business
    const pipelineId = cfg["datacrazy_pipeline_pre_vendas"] || "";
    const bizData = await dcApi("GET", `/businesses?leadId=${lead.id}`);
    const businesses = bizData?.data || bizData || [];
    let negocio = businesses.find((b: any) => b.pipelineId === pipelineId && !b.deletedAt) || null;
    if (!negocio) {
      negocio = await dcApi("POST", "/businesses", { leadId: lead.id, stageId, attendantId: closerDcId });
    }

    // Step 3: Move business to stage
    try {
      await dcApi("POST", "/businesses/actions/move", { ids: [negocio.id], destinationStageId: stageId });
    } catch (e) { console.warn("Move business failed:", e); }

    // Step 4-5: Create activities
    const dateTimeISO = `${record.scheduled_date}T${record.scheduled_time}:00Z`;
    const meetUrl = record.meet_link || "";
    const descParts = [`Closer: ${closerName}`, `SDR: ${sdrName}`, `Link Meet: ${meetUrl}`];
    if (record.observation) descParts.push(`\nObservações: ${record.observation}`);
    const desc = descParts.join("\n");

    const activityType = record.meeting_reason || "Reunião";
    const isDefaultReuniao = !record.meeting_reason || record.meeting_reason === "Reunião";

    if (isDefaultReuniao) {
      // SDR activity
      if (sdrDcId) {
        try {
          await dcApi("POST", `/leads/${lead.id}/activities`, {
            type: "Reunião", title: `Reunião — ${record.lead_name}`,
            description: desc, scheduledAt: dateTimeISO, attendantId: sdrDcId,
          });
        } catch (e) { console.warn("SDR activity failed:", e); }
      }
      // Closer activity
      try {
        await dcApi("POST", `/leads/${lead.id}/activities`, {
          type: "Reunião", title: `Reunião — ${record.lead_name}`,
          description: desc, scheduledAt: dateTimeISO, attendantId: closerDcId,
        });
      } catch (e) { console.warn("Closer activity failed:", e); }
    } else {
      const creatorDcId = sdrDcId || closerDcId;
      try {
        await dcApi("POST", `/leads/${lead.id}/activities`, {
          type: activityType, title: `${activityType} — ${record.lead_name}`,
          description: desc, scheduledAt: dateTimeISO, attendantId: creatorDcId,
        });
      } catch (e) { console.warn("Creator activity failed:", e); }
    }

    // Step 6: Create note with observation
    if (record.observation) {
      try { await dcApi("POST", `/leads/${lead.id}/notes`, { content: record.observation }); }
      catch (e) { console.warn("Note creation failed:", e); }
    }

    // Step 7: Remove "agendamento" tag
    try {
      const tags = lead.tags || [];
      const tagAg = tags.find((t: any) => t.name?.toLowerCase() === "agendamento");
      if (tagAg) await dcApi("DELETE", `/leads/${lead.id}/tags/${tagAg.id}`);
    } catch (e) { console.warn("Tag removal failed:", e); }

    console.log("CRM sync completed for agendamento:", record.id);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CRM sync error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
