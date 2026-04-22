/**
 * Webhook público recebido do DataCrazy quando o lead clica em "Confirmado"
 * via WhatsApp. Atualiza o status do agendamento para "confirmada".
 *
 * Aceita identificação por:
 *   - agendamento_id (UUID)        ← mais confiável
 *   - lead_phone + scheduled_date  ← fallback (quando o CRM só tem o telefone)
 *
 * Endpoint público (sem JWT). Para segurança em produção, considere validar
 * um shared secret enviado pelo DataCrazy via header `x-datacrazy-secret`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-datacrazy-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  agendamento_id?: string;
  lead_phone?: string;
  scheduled_date?: string; // YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as Payload;

    if (!body.agendamento_id && !body.lead_phone) {
      return new Response(
        JSON.stringify({ error: "Forneça agendamento_id ou lead_phone." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Localiza o agendamento
    let query = supabase
      .from("agendamentos")
      .select("id, status, lead_name, lead_phone, scheduled_date")
      .is("deleted_at", null);

    if (body.agendamento_id) {
      query = query.eq("id", body.agendamento_id);
    } else {
      query = query.eq("lead_phone", body.lead_phone!);
      if (body.scheduled_date) {
        query = query.eq("scheduled_date", body.scheduled_date);
      }
      // Pega o mais recente (caso haja vários)
      query = query.order("created_at", { ascending: false }).limit(1);
    }

    const { data: rows, error: findErr } = await query;
    if (findErr) throw findErr;
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Agendamento não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ag = rows[0];

    // Só atualiza se ainda não estiver "confirmada" ou em estado terminal
    if (["confirmada", "realizada", "cancelada", "no_show"].includes(ag.status)) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          message: `Agendamento já está em estado ${ag.status}.`,
          agendamento_id: ag.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updErr } = await supabase
      .from("agendamentos")
      .update({ status: "confirmada" })
      .eq("id", ag.id);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        ok: true,
        agendamento_id: ag.id,
        lead_name: ag.lead_name,
        new_status: "confirmada",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[datacrazy-confirm-webhook]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
