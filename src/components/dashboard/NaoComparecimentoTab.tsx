import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CalendarX2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { classifyNaoCompareceu, splitNaoCompareceu } from "@/lib/noShowReasons";
import { countsAsSdr } from "@/lib/sdrOverrides";
import { cn } from "@/lib/utils";

interface Props {
  currentDate: Date;
  dateRange?: DateRange;
  updatedAgo?: string;
}

interface Row {
  id: string;
  lead_name: string;
  lead_phone: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  created_at: string;
  status: string;
  cancellation_reason: string | null;
  closer_id: string | null;
  created_by: string | null;
  sdr_responsavel_id: string | null;
  closers?: { name: string } | null;
}

const NO_REASON_LABEL = "Sem motivo informado";

/** Cores por fatia — tokens semânticos do design system. */
const SLICE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "hsl(38 92% 50%)",
  "hsl(199 89% 48%)",
  "hsl(262 83% 58%)",
  "hsl(142 71% 45%)",
  "hsl(var(--muted-foreground))",
];

type DateField = "scheduled" | "created";

export default function NaoComparecimentoTab({ currentDate, dateRange, updatedAgo }: Props) {
  const [dateField, setDateField] = useState<DateField>("scheduled");
  const [sdrFilter, setSdrFilter] = useState<string>("all");
  const [drilldown, setDrilldown] = useState<{ label: string; rows: Row[] } | null>(null);
  const [exporting, setExporting] = useState(false);

  const isRange = !!(dateRange?.from && dateRange?.to);
  const fromStr = format(isRange ? dateRange!.from! : currentDate, "yyyy-MM-dd");
  const toStr = format(isRange ? dateRange!.to! : currentDate, "yyyy-MM-dd");

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["nao-comparecimento", fromStr, toStr, dateField],
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select(
          "id, lead_name, lead_phone, scheduled_date, scheduled_time, created_at, status, cancellation_reason, closer_id, created_by, sdr_responsavel_id, closers ( name )",
        )
        .in("status", ["no_show", "cancelada"])
        .is("deleted_at", null);

      if (dateField === "scheduled") {
        q = q.gte("scheduled_date", fromStr).lte("scheduled_date", toStr);
      } else {
        q = q
          .gte("created_at", `${fromStr}T00:00:00-03:00`)
          .lte("created_at", `${toStr}T23:59:59-03:00`);
      }

      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

  const { data: sdrProfiles = [] } = useQuery<{ user_id: string; full_name: string }[]>({
    queryKey: ["sdr-profiles-nao-comparecimento"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;
      const roleMap = new Map<string, string>((roles ?? []).map((r: any) => [r.user_id, r.role]));

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, is_sdr_override")
        .eq("active", true);
      if (profilesError) throw profilesError;

      return ((profiles ?? []) as any[])
        .filter((p) =>
          countsAsSdr({
            role: roleMap.get(p.user_id),
            isOverride: p.is_sdr_override,
            fullName: p.full_name,
          }),
        )
        .map((p) => ({ user_id: p.user_id, full_name: p.full_name }));
    },
    staleTime: 5 * 60_000,
  });

  const sdrNameById = useMemo(
    () => new Map(sdrProfiles.map((p) => [p.user_id, p.full_name])),
    [sdrProfiles],
  );

  const sdrIdOf = (r: Row) => r.sdr_responsavel_id || r.created_by || null;

  const filtered = useMemo(
    () => (sdrFilter === "all" ? rows : rows.filter((r) => sdrIdOf(r) === sdrFilter)),
    [rows, sdrFilter],
  );

  const slices = useMemo(() => {
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const label = (r.cancellation_reason || "").trim() || NO_REASON_LABEL;
      const list = map.get(label);
      if (list) list.push(r);
      else map.set(label, [r]);
    });
    return Array.from(map.entries())
      .map(([label, list]) => ({ label, value: list.length, rows: list }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const total = filtered.length;

  const buckets = useMemo(() => {
    const { cancelada, noShow } = splitNaoCompareceu(filtered as any);
    const ignorados = filtered.filter(
      (r) => classifyNaoCompareceu(r as any, filtered as any) === "ignorado",
    );
    return { cancelada: cancelada.length, noShow: noShow.length, ignorados: ignorados.length };
  }, [filtered]);

  const periodLabel = isRange
    ? `${format(dateRange!.from!, "dd/MM/yyyy")} — ${format(dateRange!.to!, "dd/MM/yyyy")}`
    : format(currentDate, "dd/MM/yyyy");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarX2 className="h-5 w-5 text-destructive" />
          <h2 className="text-base font-semibold">Motivos de não comparecimento</h2>
        </div>
        <Badge variant="outline" className="text-xs">{periodLabel}</Badge>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border rounded-md p-0.5">
            <Button
              variant={dateField === "scheduled" ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setDateField("scheduled")}
            >
              Data da reunião
            </Button>
            <Button
              variant={dateField === "created" ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setDateField("created")}
            >
              Data de criação
            </Button>
          </div>

          <select
            value={sdrFilter}
            onChange={(e) => setSdrFilter(e.target.value)}
            className="h-7 rounded-md border bg-background px-2 text-xs"
            aria-label="Filtrar por SDR"
          >
            <option value="all">Todos os SDRs</option>
            {sdrProfiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>{p.full_name}</option>
            ))}
          </select>

          {updatedAgo && (
            <span className="text-[11px] text-muted-foreground">Atualizado {updatedAgo}</span>
          )}
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard title="Total não comparecimento" value={total} />
        <SummaryCard title="Contabilizado como Cancelado" value={buckets.cancelada} />
        <SummaryCard title="Contabilizado como No-show" value={buckets.noShow} />
        <SummaryCard
          title="Não contabilizado (novo horário no mesmo dia)"
          value={buckets.ignorados}
        />
      </div>

      {/* Gráfico */}
      <div className="rounded-xl border border-primary/10 bg-card p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground italic py-16 text-center">Carregando…</p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground italic py-16 text-center">
            Nenhum não comparecimento registrado no período.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] items-center">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                    onClick={(d: any) => {
                      const s = slices.find((x) => x.label === d?.payload?.label);
                      if (s) setDrilldown({ label: s.label, rows: s.rows });
                    }}
                  >
                    {slices.map((s, i) => (
                      <Cell
                        key={s.label}
                        fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                        className="cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number, name: string) => [
                      `${v} (${((v / total) * 100).toFixed(1)}%)`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legenda detalhada */}
            <div className="space-y-1.5">
              {slices.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => setDrilldown({ label: s.label, rows: s.rows })}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                    "hover:bg-muted/60 transition-colors",
                  )}
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="font-semibold">{s.value}</span>
                  <span className="text-xs text-muted-foreground w-14 text-right">
                    {((s.value / total) * 100).toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drill-down */}
      <Dialog open={!!drilldown} onOpenChange={(o) => !o && setDrilldown(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {drilldown?.label} · {drilldown?.rows.length ?? 0} registro(s)
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-2">
              {drilldown?.rows
                .slice()
                .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1))
                .map((r) => (
                  <div key={r.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.lead_name}</span>
                      {r.lead_phone && (
                        <span className="text-xs text-muted-foreground">{r.lead_phone}</span>
                      )}
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {r.status === "cancelada" ? "cancelada" : "no-show"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(`${r.scheduled_date}T12:00:00`), "dd/MM/yyyy")}
                      {r.scheduled_time ? ` às ${r.scheduled_time}` : ""}
                      {` · ${sdrNameById.get(sdrIdOf(r) ?? "") ?? "SDR"}`}
                    </p>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-primary/10 bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
