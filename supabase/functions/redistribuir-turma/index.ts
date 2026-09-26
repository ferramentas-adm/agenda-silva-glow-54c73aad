// POST /redistribuir-turma — move um closer da Turma A para a B e redistribui
// suas reuniões futuras de leads qualificados para closers livres da Turma A.
// Sem closer livre no horário, a reunião volta para "Aguardando Atribuição".
// Body: { closer_id: uuid, dry_run?: boolean }
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadDayAvailability, spDateTime, spParts, suggestFreeCloser } from "../_shared/disponibilidade.ts";

// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STATUS_ATIVOS = ["agendada", "confirmada", "pendente", "nao_confirmada"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await auth.auth.getClaims(authHeader.slice(7));
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((roleRows ?? []).map((r: any) => String(r.role)));
  if (!roles.has("gestor") && !roles.has("moderador") && !roles.has("supervisor")) {
    return json({ error: "forbidden" }, 403);
  }

  const body = await req.json().catch(() => null);
  const closerId = body?.closer_id as string | undefined;
  const dryRun = body?.dry_run === true;
  if (!closerId) return json({ error: "closer_id obrigatório" }, 400);

  try {
    const { data: closer } = await admin.from("closers").select("id, name, em_treinamento").eq("id", closerId).maybeSingle();
    if (!closer) return json({ error: "closer_nao_encontrado" }, 404);

    const { data: prof } = await admin.from("profiles").select("full_name, email").eq("user_id", userId).maybeSingle();
    const now = spParts(new Date());
    const { data: ags, error } = await admin.from("agendamentos")
      .select("id, lead_name, scheduled_date, scheduled_time, status, meeting_reason")
      .eq("closer_id", closerId).is("deleted_at", null)
      .eq("lead_desqualificado", false)
      .in("status", STATUS_ATIVOS)
      .gte("scheduled_date", now.dateStr)
      .order("scheduled_date").order("scheduled_time");
    if (error) throw error;

    const futuras = (ags ?? []).filter((a: any) =>
      spDateTime(String(a.scheduled_date), String(a.scheduled_time).slice(0, 5)).getTime() > Date.now());

    // Disponibilidade da Turma A por dia, sem o closer que está saindo.
    const dias = new Map<string, any>();
    const plano: { id: string; lead_name: string; data: string; hora: string; novo_closer_id: string | null; novo_closer: string | null }[] = [];
    for (const a of futuras) {
      const d = String(a.scheduled_date);
      const h = String(a.scheduled_time).slice(0, 5);
      if (!dias.has(d)) dias.set(d, await loadDayAvailability(admin, d, undefined, "A"));
      const day = dias.get(d);
      const info = day.hours.get(h);
      if (info) info.freeClosers = info.freeClosers.filter((c: any) => c.id !== closerId);
      const chosen = info ? suggestFreeCloser(day, h) : null;
      if (chosen && info) {
        // Reserva o horário para não mandar duas reuniões ao mesmo closer.
        info.freeClosers = info.freeClosers.filter((c: any) => c.id !== chosen.id);
        day.perCloserDay.set(chosen.id, (day.perCloserDay.get(chosen.id) ?? 0) + 1);
      }
      plano.push({ id: a.id, lead_name: a.lead_name, data: d, hora: h, novo_closer_id: chosen?.id ?? null, novo_closer: chosen?.name ?? null });
    }

    if (dryRun) {
      return json({ ok: true, dry_run: true, closer: closer.name, total: plano.length, plano });
    }

    const resultados: any[] = [];
    for (const p of plano) {
      let destino: "transferida" | "fila" | "erro" = "fila";
      let detalhe: string | null = null;
      if (p.novo_closer_id) {
        const res = await fetch(`${url}/functions/v1/google-transfer-event`, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ agendamento_id: p.id, new_closer_id: p.novo_closer_id }),
        });
        const r = await res.json().catch(() => null);
        if (res.ok && r?.success) destino = "transferida";
        else { detalhe = r?.error ?? `http_${res.status}`; }
      }
      if (destino !== "transferida") {
        const { error: uErr } = await admin.from("agendamentos")
          .update({ closer_id: null, status: "pendente" }).eq("id", p.id).eq("closer_id", closerId);
        if (uErr) { destino = "erro"; detalhe = uErr.message; }
        else {
          destino = "fila";
          const { data: mgrs } = await admin.from("user_roles").select("user_id").in("role", ["gestor", "moderador", "supervisor"]);
          if (mgrs?.length) {
            await admin.from("notifications").insert(mgrs.map((m: any) => ({
              user_id: m.user_id,
              type: "pending_closer_assignment",
              title: "Reunião aguardando atribuição",
              message: `Reunião com ${p.lead_name} em ${p.data.slice(8, 10)}/${p.data.slice(5, 7)} às ${p.hora} voltou para atribuição (${closer.name} foi para a Turma B).`,
              entity_type: "agendamento",
              entity_id: p.id,
            })));
          }
        }
      }
      await admin.from("audit_logs").insert({
        user_id: userId,
        user_name: prof?.full_name ?? "Gestor",
        user_email: prof?.email ?? null,
        action: "redistribuir_troca_turma",
        entity_type: "agendamento",
        entity_id: p.id,
        details: {
          lead_name: p.lead_name, scheduled_date: p.data, scheduled_time: p.hora,
          closer_anterior_id: closerId, closer_anterior: closer.name,
          novo_closer_id: destino === "transferida" ? p.novo_closer_id : null,
          novo_closer: destino === "transferida" ? p.novo_closer : null,
          destino, detalhe,
        },
      });
      resultados.push({ ...p, destino, detalhe });
    }

    const { error: tErr } = await admin.from("closers").update({ em_treinamento: true }).eq("id", closerId);
    if (tErr) throw tErr;

    return json({
      ok: true,
      closer: closer.name,
      total: resultados.length,
      transferidas: resultados.filter((r) => r.destino === "transferida").length,
      fila: resultados.filter((r) => r.destino === "fila").length,
      erros: resultados.filter((r) => r.destino === "erro").length,
      resultados,
    });
  } catch (e) {
    console.error("redistribuir-turma error", e);
    return json({ error: "internal_error", detalhe: String((e as any)?.message ?? e) }, 500);
  }
});
