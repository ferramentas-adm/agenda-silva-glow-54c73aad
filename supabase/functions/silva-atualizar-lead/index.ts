// POST /silva-atualizar-lead — corrige dados do lead de uma reunião já criada, sem cancelar/remarcar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { errorDetail } from "../_shared/erro.ts";

const SDR_IA_EMAIL = "joao.amorim.ia@ogruposilva.com.br";
const SDR_IA_NAME = "João Amorim";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  agendamento_id: z.string().uuid(),
  nome: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional(),
}).refine((b) => b.nome !== undefined || b.email !== undefined, {
  message: "Informe nome e/ou email",
  path: ["nome"],
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ erro: "payload_invalido", campos: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { data: sdrProfile } = await supabase.from("profiles").select("user_id, full_name")
      .eq("email", SDR_IA_EMAIL).maybeSingle();

    const { data: ag, error: loadError } = await supabase.from("agendamentos")
      .select("id, lead_name, lead_email, status").eq("id", b.agendamento_id).is("deleted_at", null).maybeSingle();
    if (loadError) throw loadError;
    if (!ag) return json({ erro: "nao_encontrado" }, 404);

    const update: Record<string, string> = {};
    if (b.nome) update.lead_name = b.nome;
    if (b.email) update.lead_email = b.email;

    const { data: updated, error: updateError } = await supabase.from("agendamentos")
      .update(update).eq("id", ag.id).select("id, lead_name, lead_email").single();
    if (updateError) throw updateError;

    if (sdrProfile) {
      await supabase.from("audit_logs").insert({
        user_id: sdrProfile.user_id,
        user_name: sdrProfile.full_name || SDR_IA_NAME,
        user_email: SDR_IA_EMAIL,
        action: "update_lead_agendamento",
        entity_type: "agendamento",
        entity_id: ag.id,
        details: {
          nome_antigo: ag.lead_name,
          nome_novo: updated.lead_name,
          email_antigo: ag.lead_email,
          email_novo: updated.lead_email,
          via: "silva-atualizar-lead",
        },
      });
    }

    return json({
      ok: true,
      agendamento_id: updated.id,
      nome: updated.lead_name,
      email: updated.lead_email ?? null,
    });
  } catch (error) {
    console.error("silva-atualizar-lead error", error);
    return json({ erro: "internal_error", detalhe: errorDetail(error) }, 500);
  }
});
