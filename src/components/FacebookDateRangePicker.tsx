import { useEffect, useMemo, useState } from "react";
import {
  addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format,
  isSameDay, startOfMonth, startOfWeek, subDays, subMonths, subYears,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ───────────── Tipos públicos ─────────────
export type FBPeriod = { from: Date; to: Date; presetKey?: PresetKey | null };
export type FBComparisonMode = "previous" | "year" | "custom";
export type FBComparison = { from: Date; to: Date; mode: FBComparisonMode };

interface Props {
  value: FBPeriod;
  comparison?: FBComparison | null;
  onChange: (period: FBPeriod, comparison: FBComparison | null) => void;
  align?: "start" | "end" | "center";
  className?: string;
  buttonSize?: "sm" | "default";
}

// ───────────── Presets ─────────────
type PresetKey =
  | "hoje" | "ontem" | "hoje_ontem"
  | "ultimos_7" | "ultimos_14" | "ultimos_28" | "ultimos_30"
  | "esta_semana" | "semana_passada"
  | "este_mes" | "mes_passado";

const PRESETS: { key: PresetKey; label: string; compute: (now: Date) => { from: Date; to: Date } }[] = [
  { key: "hoje", label: "Hoje", compute: (n) => ({ from: n, to: n }) },
  { key: "ontem", label: "Ontem", compute: (n) => { const y = subDays(n, 1); return { from: y, to: y }; } },
  { key: "hoje_ontem", label: "Hoje e ontem", compute: (n) => ({ from: subDays(n, 1), to: n }) },
  { key: "ultimos_7", label: "Últimos 7 dias", compute: (n) => ({ from: subDays(n, 6), to: n }) },
  { key: "ultimos_14", label: "Últimos 14 dias", compute: (n) => ({ from: subDays(n, 13), to: n }) },
  { key: "ultimos_28", label: "Últimos 28 dias", compute: (n) => ({ from: subDays(n, 27), to: n }) },
  { key: "ultimos_30", label: "Últimos 30 dias", compute: (n) => ({ from: subDays(n, 29), to: n }) },
  { key: "esta_semana", label: "Esta semana", compute: (n) => ({ from: startOfWeek(n, { weekStartsOn: 1 }), to: endOfWeek(n, { weekStartsOn: 1 }) }) },
  { key: "semana_passada", label: "Semana passada", compute: (n) => { const lw = subDays(n, 7); return { from: startOfWeek(lw, { weekStartsOn: 1 }), to: endOfWeek(lw, { weekStartsOn: 1 }) }; } },
  { key: "este_mes", label: "Este mês", compute: (n) => ({ from: startOfMonth(n), to: endOfMonth(n) }) },
  { key: "mes_passado", label: "Mês passado", compute: (n) => { const lm = subMonths(n, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; } },
];

const RECENT_KEY = "fb-date-presets-recent";
function loadRecent(): PresetKey[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as PresetKey[]).filter((k) => PRESETS.some((p) => p.key === k)).slice(0, 3);
  } catch { return []; }
}
function pushRecent(key: PresetKey) {
  const cur = loadRecent().filter((k) => k !== key);
  cur.unshift(key);
  localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 3)));
}

// ───────────── Helpers ─────────────
function fmtTrigger(p: FBPeriod): string {
  const f = format(p.from, "d MMM yyyy", { locale: ptBR });
  const t = format(p.to, "d MMM yyyy", { locale: ptBR });
  return isSameDay(p.from, p.to) ? f : `${f} – ${t}`;
}
function fmtField(d: Date): string {
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
}
function computeComparison(period: { from: Date; to: Date }, mode: FBComparisonMode): { from: Date; to: Date } {
  if (mode === "year") return { from: subYears(period.from, 1), to: subYears(period.to, 1) };
  // previous
  const days = differenceInCalendarDays(period.to, period.from) + 1;
  const to = subDays(period.from, 1);
  const from = subDays(to, days - 1);
  return { from, to };
}

// ───────────── Caption customizado (selects de mês/ano) ─────────────
const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function buildYears(): number[] {
  const y = new Date().getFullYear();
  const arr: number[] = [];
  for (let i = y - 5; i <= y + 2; i++) arr.push(i);
  return arr;
}

function MonthYearCaption({
  displayMonth, onChange,
}: { displayMonth: Date; onChange: (d: Date) => void }) {
  const years = useMemo(buildYears, []);
  return (
    <div className="flex items-center justify-center gap-2 pt-1 pb-2">
      <Select
        value={String(displayMonth.getMonth())}
        onValueChange={(v) => { const d = new Date(displayMonth); d.setMonth(Number(v)); onChange(d); }}
      >
        <SelectTrigger className="h-7 w-[88px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS_PT.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={String(displayMonth.getFullYear())}
        onValueChange={(v) => { const d = new Date(displayMonth); d.setFullYear(Number(v)); onChange(d); }}
      >
        <SelectTrigger className="h-7 w-[84px] text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ───────────── Componente principal ─────────────
export function FacebookDateRangePicker({
  value, comparison = null, onChange,
  align = "end", className, buttonSize = "sm",
}: Props) {
  const [open, setOpen] = useState(false);

  // Estado interno (commit no Atualizar)
  const [draftRange, setDraftRange] = useState<DateRange>({ from: value.from, to: value.to });
  const [draftPreset, setDraftPreset] = useState<PresetKey | null>(value.presetKey ?? null);
  const [compareOn, setCompareOn] = useState<boolean>(!!comparison);
  const [compareMode, setCompareMode] = useState<FBComparisonMode>(comparison?.mode ?? "previous");
  const [compareRange, setCompareRange] = useState<DateRange | undefined>(
    comparison ? { from: comparison.from, to: comparison.to } : undefined,
  );
  const [leftMonth, setLeftMonth] = useState<Date>(value.from);
  const [recent, setRecent] = useState<PresetKey[]>(loadRecent());

  // Sincroniza quando o popover abre
  useEffect(() => {
    if (open) {
      setDraftRange({ from: value.from, to: value.to });
      setDraftPreset(value.presetKey ?? null);
      setCompareOn(!!comparison);
      setCompareMode(comparison?.mode ?? "previous");
      setCompareRange(comparison ? { from: comparison.from, to: comparison.to } : undefined);
      setLeftMonth(value.from);
      setRecent(loadRecent());
    }
  }, [open, value, comparison]);

  // Auto-recalcula comparação quando muda o range principal ou o modo
  useEffect(() => {
    if (!compareOn || compareMode === "custom") return;
    if (!draftRange.from || !draftRange.to) return;
    const c = computeComparison({ from: draftRange.from, to: draftRange.to }, compareMode);
    setCompareRange(c);
  }, [compareOn, compareMode, draftRange.from, draftRange.to]);

  const applyPreset = (key: PresetKey) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    const r = p.compute(new Date());
    setDraftRange({ from: r.from, to: r.to });
    setDraftPreset(key);
    setLeftMonth(r.from);
  };

  const handleConfirm = () => {
    if (!draftRange.from || !draftRange.to) return;
    if (draftPreset) pushRecent(draftPreset);
    const cmp: FBComparison | null = compareOn && compareRange?.from && compareRange?.to
      ? { from: compareRange.from, to: compareRange.to, mode: compareMode }
      : null;
    onChange(
      { from: draftRange.from, to: draftRange.to, presetKey: draftPreset },
      cmp,
    );
    setOpen(false);
  };

  const trigger = (
    <Button
      variant="outline"
      size={buttonSize}
      className={cn("h-9 justify-start text-left font-normal min-w-[240px]", className)}
    >
      <CalendarIcon className="h-4 w-4 mr-2 text-primary" />
      <span>{fmtTrigger(value)}</span>
      {comparison && (
        <span className="ml-2 text-xs text-muted-foreground">
          vs {format(comparison.from, "d MMM", { locale: ptBR })}–{format(comparison.to, "d MMM", { locale: ptBR })}
        </span>
      )}
      <ChevronDown className="ml-auto h-4 w-4 opacity-60" />
    </Button>
  );

  const recentPresets = useMemo(
    () => recent.map((k) => PRESETS.find((p) => p.key === k)).filter(Boolean) as typeof PRESETS,
    [recent],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="p-0 w-[760px] max-w-[95vw] pointer-events-auto"
        align={align}
      >
        <div className="flex flex-col md:flex-row">
          {/* Coluna esquerda: presets */}
          <ScrollArea className="md:w-[220px] md:max-h-[480px] border-r">
            <div className="p-3 space-y-3">
              {recentPresets.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-foreground mb-1.5 px-1">Usados recentemente</div>
                  <RadioGroup
                    value={recentPresets.some((p) => p.key === draftPreset) ? draftPreset ?? "" : ""}
                    onValueChange={(v) => applyPreset(v as PresetKey)}
                    className="space-y-1"
                  >
                    {recentPresets.map((p) => (
                      <label key={`r-${p.key}`} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer">
                        <RadioGroupItem value={p.key} id={`r-${p.key}`} />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              )}

              <RadioGroup
                value={draftPreset ?? ""}
                onValueChange={(v) => applyPreset(v as PresetKey)}
                className="space-y-1"
              >
                {PRESETS.filter((p) => !recent.includes(p.key)).map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer">
                    <RadioGroupItem value={p.key} id={p.key} />
                    <span>{p.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </ScrollArea>

          {/* Painel direito: calendário + comparação */}
          <div className="flex-1 p-3 space-y-3">
            <Calendar
              mode="range"
              numberOfMonths={2}
              locale={ptBR}
              weekStartsOn={1}
              month={leftMonth}
              onMonthChange={setLeftMonth}
              selected={draftRange}
              onSelect={(r) => {
                if (!r) return;
                setDraftRange(r);
                setDraftPreset(null);
              }}
              showOutsideDays
              className="pointer-events-auto p-0"
              components={{
                Caption: ({ displayMonth }) => (
                  <MonthYearCaption
                    displayMonth={displayMonth}
                    onChange={(d) => {
                      // Se for o segundo mês, ajusta para que esse vire o "esquerdo + 1"
                      const isLeft = displayMonth.getMonth() === leftMonth.getMonth()
                        && displayMonth.getFullYear() === leftMonth.getFullYear();
                      setLeftMonth(isLeft ? d : subMonths(d, 1));
                    }}
                  />
                ),
              }}
            />

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cmp"
                  checked={compareOn}
                  onCheckedChange={(c) => setCompareOn(!!c)}
                />
                <Label htmlFor="cmp" className="text-sm cursor-pointer">Comparar</Label>
              </div>

              {compareOn && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <Select value={compareMode} onValueChange={(v) => setCompareMode(v as FBComparisonMode)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="previous">Período anterior</SelectItem>
                      <SelectItem value="year">Ano anterior</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={compareRange?.from ? fmtField(compareRange.from) : ""}
                    readOnly={compareMode !== "custom"}
                    onChange={(e) => {
                      if (compareMode !== "custom") return;
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) setCompareRange({ from: d, to: compareRange?.to ?? d });
                    }}
                    className="h-9 text-sm"
                  />
                  <Input
                    value={compareRange?.to ? fmtField(compareRange.to) : ""}
                    readOnly={compareMode !== "custom"}
                    onChange={(e) => {
                      if (compareMode !== "custom") return;
                      const d = new Date(e.target.value);
                      if (!isNaN(d.getTime())) setCompareRange({ from: compareRange?.from ?? d, to: d });
                    }}
                    className="h-9 text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                <div className="text-sm text-muted-foreground">
                  {draftPreset ? PRESETS.find((p) => p.key === draftPreset)?.label : "Personalizado"}
                </div>
                <Input
                  value={draftRange.from ? fmtField(draftRange.from) : ""}
                  readOnly
                  className="h-9 text-sm"
                />
                <Input
                  value={draftRange.to ? fmtField(draftRange.to) : ""}
                  readOnly
                  className="h-9 text-sm"
                />
              </div>

              <div className="text-xs text-muted-foreground">
                Fuso horário das datas: Horário de São Paulo
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button size="sm" onClick={handleConfirm} disabled={!draftRange.from || !draftRange.to}>
                  Atualizar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default FacebookDateRangePicker;
