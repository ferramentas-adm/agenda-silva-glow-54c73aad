import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get("DATACRAZY_WEBHOOK_URL");
    if (!webhookUrl) {
      throw new Error("DATACRAZY_WEBHOOK_URL is not configured");
    }

    const payload = await req.json();

    // Marca o tipo de evento para o DataCrazy diferenciar do webhook de status
    const enrichedPayload = {
      event: "venda_resultado",
      ...payload,
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enrichedPayload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`DataCrazy venda webhook failed [${response.status}]:`, body);
      return new Response(
        JSON.stringify({
          success: false,
          fallback: true,
          error: `DataCrazy venda webhook failed [${response.status}]`,
          details: body,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
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
