// GET /silva-disponibilidade — slots livres para o SDR IA (João Amorim).
// Regra exclusiva do SDR IA: lotação global da hora com +3 vagas extras.
// O closer no slot_id é escolhido pela menor carga naquela hora.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  AVAILABILITY_MIN_LEAD_MINUTES, addDays, fetchBusinessSlots, labelFor, loadDayAvailability,
  spDateTime, spParts, suggestCloser, toSpIso,
} from "../_shared/disponibilidade.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) return json({ erro: "unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const now = new Date();
    const fromParam = url.searchParams.get("a_partir_de");
    const toParam = url.searchParams.get("ate");
    const limitParam = parseInt(url.searchParams.get("limite") ?? "6", 10);
    const limite = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 6;

    const fromDate = fromParam ? new Date(fromParam) : now;
    if (Number.isNaN(fromDate.getTime())) return json({ erro: "a_partir_de_invalido" }, 400);
    const minStart = new Date(Math.max(fromDate.getTime(), now.getTime()) + AVAILABILITY_MIN_LEAD_MINUTES * 60_000);
    const toDate = toParam ? new Date(toParam) : new Date(minStart.getTime() + 3 * 24 * 60 * 60_000);
    if (Number.isNaN(toDate.getTime())) return json({ erro: "ate_invalido" }, 400);
    if (toDate <= minStart) return json({ gerado_em: now.toISOString(), slots: [] });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const businessSlots = await fetchBusinessSlots(supabase);
    const todayStr = spParts(now).dateStr;
    const startDay = spParts(minStart).dateStr;
    const endDay = spParts(toDate).dateStr;

    const slots: { slot_id: string; inicio: string; label: string }[] = [];
    for (let day = startDay; day <= endDay && slots.length < limite; day = addDays(day, 1)) {
      const avail = await loadDayAvailability(supabase, day, businessSlots);
      for (const slot of businessSlots) {
        if (slots.length >= limite) break;
        const start = spDateTime(day, slot);
        if (start < minStart || start > toDate) continue;
        const info = avail.hours.get(slot);
        if (!info || info.full) continue;
        const closer = suggestCloser(avail, slot);
        if (!closer) continue; // sem closer livre não há como atender
        slots.push({
          slot_id: `${toSpIso(start)}|${closer.id}`,
          inicio: toSpIso(start),
          label: labelFor(day, slot, todayStr),
        });
      }
    }
    return json({ gerado_em: now.toISOString(), slots });
  } catch (e) {
    console.error("silva-disponibilidade error", e);
    return json({ erro: "internal_error", detalhe: e instanceof Error ? e.message : String(e) }, 500);
  }
});
