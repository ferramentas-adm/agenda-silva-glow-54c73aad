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
    const DATACRAZY_API_URL = Deno.env.get("DATACRAZY_API_URL");
    if (!DATACRAZY_API_URL) throw new Error("DATACRAZY_API_URL is not configured");

    const DATACRAZY_API_TOKEN = Deno.env.get("DATACRAZY_API_TOKEN");
    if (!DATACRAZY_API_TOKEN) throw new Error("DATACRAZY_API_TOKEN is not configured");

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { method = "GET", path, payload } = body as {
      method: string;
      path: string;
      payload?: unknown;
    };

    if (!path) throw new Error("Missing 'path' in request body");

    // Build URL
    const url = `${DATACRAZY_API_URL}${path}`;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: DATACRAZY_API_TOKEN,
      },
    };

    if (payload && method !== "GET") {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(url, fetchOptions);
    const responseData = await response.text();

    let parsed;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = { raw: responseData };
    }

    return new Response(JSON.stringify(parsed), {
      status: response.ok ? 200 : response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("DataCrazy proxy error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
