// POST /sdr-ia-db — proxy autenticado do n8n para o PostgREST (service_role interno).
// Escopo restrito às tabelas do SDR IA: sdr_conversas, sdr_exclusoes, sdr_config, sdr_downsell.
// Auth: x-api-key = SDR_IA_API_KEY (verify_jwt = false).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};

const ALLOWED_TABLES = ["sdr_conversas", "sdr_exclusoes", "sdr_config", "sdr_downsell"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ erro: "method_not_allowed" }, { status: 405, headers: corsHeaders });
  }

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) {
    return Response.json({ erro: "unauthorized" }, { status: 401, headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => null);
    const path = typeof payload?.path === "string" ? payload.path : null;
    const method = typeof payload?.method === "string" ? payload.method.toUpperCase() : null;
    const prefer = typeof payload?.prefer === "string" ? payload.prefer : null;
    const body = payload?.body;

    if (!path) {
      return Response.json({ erro: "path_obrigatorio" }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_TABLES.some((t) => path === t || path.startsWith(`${t}?`) || path.startsWith(`${t}/`))) {
      return Response.json({ erro: "forbidden", detalhe: "path deve começar com sdr_conversas, sdr_exclusoes, sdr_config ou sdr_downsell" }, { status: 403, headers: corsHeaders });
    }
    if (method !== "GET" && method !== "POST") {
      return Response.json({ erro: "method_not_allowed", detalhe: "aceita apenas GET e POST" }, { status: 405, headers: corsHeaders });
    }

    const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/${path}`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const headers: Record<string, string> = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    if (prefer) headers.Prefer = `${prefer},return=representation`;

    const res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });

    const text = await res.text();
    let data: unknown = [];
    if (text && text.trim()) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return Response.json(data, { status: res.status, headers: corsHeaders });
  } catch (e) {
    console.error("sdr-ia-db error", e);
    return Response.json({ erro: "internal_error", detalhe: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
});
