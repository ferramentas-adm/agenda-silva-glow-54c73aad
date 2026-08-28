import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { addDays, fail, NOT_AUTHENTICATED, ok, todayBRT } from "../util";

const DEFAULT_START = "09:00";
const DEFAULT_END = "21:00";

function hourSlots(start: string, end: string) {
  const s = Number(start.slice(0, 2));
  const e = Number(end.slice(0, 2));
  const out: string[] = [];
  for (let h = s; h < e; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
}

export default defineTool({
  name: "agenda_availability",
  title: "Ocupação e horários livres da agenda",
  description:
    "Mostra a ocupação da agenda por dia e horário no período: quantas reuniões por horário, quantos closers ativos, horários lotados (não oferecer ao lead) e os horários mais vazios. Respeita os horários comerciais configurados no painel.",
  inputSchema: {
    from_date: z.string().optional().describe("Data inicial (YYYY-MM-DD). Padrão: hoje."),
    to_date: z.string().optional().describe("Data final (YYYY-MM-DD, inclusiva). Padrão: from_date + 6 dias."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date, to_date }, ctx) => {
    if (!ctx.isAuthenticated()) return fail(NOT_AUTHENTICATED);
    const sb = supabaseForUser(ctx);
    const from = from_date ?? todayBRT();
    const to = to_date ?? addDays(from, 6);

    const [{ data: settings }, closersRes, agRes, blocksRes] = await Promise.all([
      sb.from("app_settings").select("key, value").in("key", ["business_hours_start", "business_hours_end"]),
      sb.from("closers").select("id, name, active").eq("active", true),
      sb
        .from("agendamentos")
        .select("id, scheduled_date, scheduled_time, closer_id, status")
        .is("deleted_at", null)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .not("status", "in", "(cancelada,no_show)")
        .limit(5000),
      sb.from("closer_blocks").select("closer_id, block_date, start_time").gte("block_date", from).lte("block_date", to),
    ]);
    if (agRes.error) return fail(agRes.error.message);

    const map = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const start = map.get("business_hours_start") || DEFAULT_START;
    const end = map.get("business_hours_end") || DEFAULT_END;
    const slots = hourSlots(start, end);
    const closersAtivos = (closersRes.data ?? []).length;

    const busy = new Map<string, number>();
    for (const a of agRes.data ?? []) {
      const key = `${a.scheduled_date}|${a.scheduled_time.slice(0, 2)}:00`;
      busy.set(key, (busy.get(key) ?? 0) + 1);
    }
    for (const b of blocksRes.data ?? []) {
      const key = `${b.block_date}|${b.start_time.slice(0, 2)}:00`;
      busy.set(key, (busy.get(key) ?? 0) + 1);
    }

    const dias: Array<{
      data: string;
      horarios: Array<{ hora: string; ocupados: number; livres: number; lotado: boolean }>;
    }> = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      dias.push({
        data: d,
        horarios: slots.map((hora) => {
          const ocupados = busy.get(`${d}|${hora}`) ?? 0;
          const livres = Math.max(closersAtivos - ocupados, 0);
          return { hora, ocupados, livres, lotado: livres === 0 && closersAtivos > 0 };
        }),
      });
    }

    const todos = dias.flatMap((d) => d.horarios.map((h) => ({ data: d.data, ...h })));
    const lotados = todos.filter((h) => h.lotado);
    const maisVazios = [...todos].sort((a, b) => b.livres - a.livres).slice(0, 6);

    return ok({
      periodo: { from, to },
      horario_comercial: { inicio: start, fim: end },
      closers_ativos: closersAtivos,
      nao_oferecer_ao_lead_lotado: lotados,
      horarios_mais_vazios: maisVazios,
      dias,
    });
  },
});
