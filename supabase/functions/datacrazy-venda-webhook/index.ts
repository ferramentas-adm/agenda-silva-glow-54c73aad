import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PayloadSchema = z.object({
  agendamento_id: z.string().uuid(),
  registered_at: z.string().datetime({ offset: true }),
  outcome: z.enum(["fechou", "perdeu", "follow_up", "em_andamento"]),
}).passthrough();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Backend configuration is incomplete");

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = Deno.env.get("DATACRAZY_WEBHOOK_URL");
    if (!webhookUrl) {
      throw new Error("DATACRAZY_WEBHOOK_URL is not configured");
    }

    const parsedPayload = PayloadSchema.safeParse(await req.json());
    if (!parsedPayload.success) {
      return new Response(JSON.stringify({ error: parsedPayload.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const payload = parsedPayload.data;
    const agendamentoId = payload.agendamento_id;
    const registeredAt = payload.registered_at;
    const outcome = payload.outcome;

    // Marca o tipo de evento para o DataCrazy diferenciar do webhook de status
    const enrichedPayload = {
      event: "venda_resultado",
      ...payload,
    };

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${agendamentoId}|${registeredAt}|${outcome}`),
    );
    const idempotencyKey = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: queued, error: queueError } = await admin
      .from("datacrazy_sales_sync_queue")
      .upsert(
        { idempotency_key: idempotencyKey, agendamento_id: agendamentoId, payload: enrichedPayload },
        { onConflict: "idempotency_key" },
      )
      .select("id, status, attempts")
      .single();
    if (queueError || !queued) throw queueError ?? new Error("Could not persist sync payload");
    if (queued.status === "sent") {
      return new Response(JSON.stringify({ success: true, queued: false, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lastStatus: number | null = null;
    let lastBody = "";
    let lastError = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(enrichedPayload),
          signal: AbortSignal.timeout(12_000),
        });
        lastStatus = response.status;
        lastBody = (await response.text()).slice(0, 4000);
        if (response.ok) {
          await admin.from("datacrazy_sales_sync_queue").update({
            status: "sent",
            attempts: queued.attempts + attempt,
            last_http_status: response.status,
            last_error: null,
            response_body: lastBody || null,
            sent_at: new Date().toISOString(),
          }).eq("id", queued.id);
          return new Response(JSON.stringify({ success: true, queued: false }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastError = `DataCrazy venda webhook failed [${response.status}]`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "DataCrazy request failed";
      }
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 500));
    }

    await admin.from("datacrazy_sales_sync_queue").update({
      status: "pending",
      attempts: queued.attempts + 2,
      last_http_status: lastStatus,
      last_error: lastError,
      response_body: lastBody || null,
    }).eq("id", queued.id);
    console.error(lastError, lastBody);
    return new Response(JSON.stringify({ success: false, queued: true, error: lastError }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("DataCrazy venda webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, fallback: true, error: message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
