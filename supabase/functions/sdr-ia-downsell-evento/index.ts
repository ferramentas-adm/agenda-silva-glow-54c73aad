import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const Body = z.object({
  telefone: z.string().regex(/^\d{10,11}$/, "deve conter 10 ou 11 dígitos"),
  evento: z.enum(["pagina", "clique"]),
  nome: z.string().trim().min(1).max(200).optional(),
  utm_content: z.string().trim().min(1).max(500).optional(),
  form_id: z.string().trim().min(1).max(200).optional(),
}).strict();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return req.headers.get("cf-connecting-ip")?.trim() || forwarded || "unknown";
}

async function hashIp(ip: string, pepper: string) {
  const bytes = new TextEncoder().encode(`${pepper}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pepper = Deno.env.get("SDR_IA_API_KEY");
  if (!url || !serviceKey || !pepper) return json({ erro: "internal_error" }, 500);

  const supabase = createClient(url, serviceKey);

  try {
    const ipHash = await hashIp(getClientIp(req), pepper);
    const { data: accepted, error: limitError } = await supabase
      .rpc("consume_sdr_downsell_rate_limit", { _ip_hash: ipHash });
    if (limitError) throw limitError;
    if (!accepted) return json({ erro: "rate_limit_exceeded" }, 429);

    const { error } = await supabase.rpc("record_sdr_downsell_event", {
      _telefone: parsed.data.telefone,
      _evento: parsed.data.evento,
      _nome: parsed.data.nome ?? null,
      _utm_content: parsed.data.utm_content ?? null,
      _form_id: parsed.data.form_id ?? null,
    });
    if (error) throw error;

    return json({ ok: true });
  } catch (error) {
    console.error("sdr-ia-downsell-evento error", error);
    return json({ erro: "internal_error" }, 500);
  }
});