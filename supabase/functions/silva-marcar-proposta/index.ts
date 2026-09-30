// POST /silva-marcar-proposta — marca que a proposta comercial foi enviada.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  agendamento_id: z.string().uuid(),
  proposta_url: z.string().trim().url().max(2000),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const agora = new Date().toISOString();
  const { data, error } = await supabase.from("agendamentos")
    .update({ proposta_enviada: true, proposta_url: parsed.data.proposta_url, proposta_em: agora })
    .eq("id", parsed.data.agendamento_id)
    .is("deleted_at", null)
    .select("id, proposta_enviada, proposta_url, proposta_em")
    .maybeSingle();
  if (error) return json({ erro: "internal_error", detalhe: error.message }, 500);
  if (!data) return json({ erro: "nao_encontrado" }, 404);

  return json({ ok: true, agendamento_id: data.id, proposta_enviada: data.proposta_enviada, proposta_url: data.proposta_url, proposta_em: data.proposta_em });
});
