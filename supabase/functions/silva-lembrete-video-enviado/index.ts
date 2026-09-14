import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const Body = z.object({
  agendamento_id: z.string().uuid(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("SILVA_VENDAS_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Payload inválido", campos: parsed.error.flatten().fieldErrors }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: appointment, error: findError } = await supabase
    .from("agendamentos")
    .select("id, status, deleted_at, lembrete_video_enviado")
    .eq("id", parsed.data.agendamento_id)
    .maybeSingle();

  if (findError) return json({ error: findError.message }, 500);
  if (!appointment || appointment.deleted_at) {
    return json({ error: "Agendamento não encontrado" }, 404);
  }
  if (!["agendada", "confirmada", "pendente"].includes(appointment.status)) {
    return json({ error: "Status não permite lembrete", status: appointment.status }, 409);
  }
  if (appointment.lembrete_video_enviado) {
    return json({
      ok: true,
      idempotente: true,
      agendamento_id: appointment.id,
      lembrete_video_enviado: appointment.lembrete_video_enviado,
    });
  }

  const sentAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("agendamentos")
    .update({ lembrete_video_enviado: sentAt })
    .eq("id", appointment.id)
    .is("lembrete_video_enviado", null)
    .select("id, lembrete_video_enviado")
    .maybeSingle();

  if (updateError) return json({ error: updateError.message }, 500);
  if (!updated) {
    const { data: current } = await supabase
      .from("agendamentos")
      .select("id, lembrete_video_enviado")
      .eq("id", appointment.id)
      .single();
    return json({ ok: true, idempotente: true, ...current });
  }

  return json({ ok: true, idempotente: false, ...updated });
});