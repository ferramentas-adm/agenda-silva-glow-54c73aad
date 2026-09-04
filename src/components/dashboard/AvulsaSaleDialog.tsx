import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, PlusCircle, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";

const DEFAULT_CHANNEL_TYPES = [
  "Outbound", "Social Selling", "Tráfego Pago", "Formulário",
  "Formulário Bio", "Formulário / Acompanhamento", "CTA",
  "Reativação", "Lead entrou em contato", "Manual", "Renovação", "Indicação",
];

interface LeadSuggestion {
  name: string;
  phone: string;
  closerId: string | null;
  sdrId: string | null;
  channelType: string | null;
  scheduledDate: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


export default function AvulsaSaleDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { items: channelTypes } = useAppSettingList(APP_SETTING_KEYS.channel_types, DEFAULT_CHANNEL_TYPES);
  const { items: produtosList } = useAppSettingList(APP_SETTING_KEYS.produtos, []);

  const { data: closers = [] } = useQuery({
    queryKey: ["avulsa-closers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["avulsa-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_profiles");
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string }[];
    },
  });

  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadFromDb, setLeadFromDb] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debouncedName, setDebouncedName] = useState("");
  const [channelType, setChannelType] = useState("");
  const [sdrId, setSdrId] = useState<string>("none");
  const [closerId, setCloserId] = useState("");
  const [produto, setProduto] = useState("");
  const [valorColetado, setValorColetado] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(leadName.trim()), 350);
    return () => clearTimeout(t);
  }, [leadName]);

  const { data: leadSuggestions = [], isFetching: searchingLeads } = useQuery({
    queryKey: ["avulsa-lead-search", debouncedName.toLowerCase()],
    enabled: open && !leadFromDb && debouncedName.length >= 2,
    staleTime: 60_000,
    retry: 0,
    queryFn: async () => {
      const term = debouncedName.replace(/[%,()]/g, " ").trim();
      const digits = debouncedName.replace(/\D/g, "");
      const filters = [`lead_name.ilike.%${term}%`];
      if (digits.length >= 3) filters.push(`lead_phone.ilike.%${digits}%`);
      const { data, error } = await supabase
        .from("agendamentos")
        .select("lead_name, lead_phone, closer_id, sdr_responsavel_id, channel_type, scheduled_date, updated_at")
        .is("deleted_at", null)
        .or(filters.join(","))
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const seen = new Set<string>();
      const out: LeadSuggestion[] = [];
      for (const row of (data ?? []) as {
        lead_name: string;
        lead_phone: string | null;
        closer_id: string | null;
        sdr_responsavel_id: string | null;
        channel_type: string | null;
        scheduled_date: string | null;
      }[]) {
        const phoneDig = (row.lead_phone ?? "").replace(/\D/g, "");
        const key = `${row.lead_name?.trim().toLowerCase()}|${phoneDig}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: row.lead_name,
          phone: row.lead_phone ?? "",
          closerId: row.closer_id,
          sdrId: row.sdr_responsavel_id,
          channelType: row.channel_type,
          scheduledDate: row.scheduled_date,
        });
        if (out.length >= 10) break;
      }
      return out;
    },

  });

  useEffect(() => {
    if (!open) {
      setLeadName(""); setLeadPhone(""); setChannelType(""); setSdrId("none"); setCloserId("");
      setProduto(""); setValorColetado(""); setValorTotal(""); setDescricao("");
      setSaleDate(new Date()); setSaving(false);
      setLeadFromDb(false); setShowSuggestions(false); setDebouncedName("");
    }
  }, [open]);


  const parseMoney = (s: string) => {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const formatPhone = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const phoneDigits = leadPhone.replace(/\D/g, "");

  const valid = useMemo(() => {
    if (!leadName.trim()) return false;
    if (phoneDigits.length < 10) return false;
    if (!channelType) return false;
    if (!closerId) return false;
    if (produtosList.length > 0 && !produto) return false;
    if (produtosList.length === 0 && !produto.trim()) return false;
    const vc = parseMoney(valorColetado);
    const vt = parseMoney(valorTotal);
    if (!(vc > 0)) return false;
    if (!(vt > 0)) return false;
    if (descricao.trim().length < 10) return false;
    return true;
  }, [leadName, phoneDigits, channelType, closerId, produto, produtosList.length, valorColetado, valorTotal, descricao]);


  const handleSubmit = async () => {
    if (!valid || !user) return;
    setSaving(true);
    try {
      const dateStr = format(saleDate, "yyyy-MM-dd");
      const sdrFinal = sdrId !== "none" ? sdrId : null;

      // 1) Cria agendamento "fantasma" marcado como venda avulsa
      const { data: ag, error: agErr } = await supabase
        .from("agendamentos")
        .insert({
          lead_name: leadName.trim(),
          lead_phone: leadPhone.trim(),
          closer_id: closerId,
          sdr_responsavel_id: sdrFinal,
          channel_type: channelType,
          scheduled_date: dateStr,
          scheduled_time: "00:00",
          status: "realizada",
          briefing: descricao.trim(),
          created_by: user.id,
          is_venda_avulsa: true,
        } as never)
        .select("id")
        .single();
      if (agErr) throw agErr;

      // 2) Cria venda associada
      const { error: vErr } = await supabase.from("vendas").insert({
        agendamento_id: (ag as { id: string }).id,
        vendeu: true,
        valor: parseMoney(valorColetado),
        valor_total_projeto: parseMoney(valorTotal),
        produto: produto.trim(),
        resumo_venda: descricao.trim(),
        closed_at: dateStr,
        created_by: user.id,
      } as never);
      if (vErr) throw vErr;

      toast.success("Venda avulsa registrada");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendas-tab"] }),
        queryClient.invalidateQueries({ queryKey: ["reunioes-list"] }),
        queryClient.invalidateQueries({ queryKey: ["agendamentos"] }),
      ]);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Falha ao registrar venda avulsa", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" /> Nova venda avulsa
          </DialogTitle>
          <DialogDescription>
            Registre uma venda antiga ou fora do fluxo de calls. Entra no coletado total
            e credita SDR/Closer, mas <strong>não conta</strong> no denominador de conversão do dia.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 relative">
              <Label className="flex items-center gap-2">
                Nome do cliente *
                {leadFromDb && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    lead do banco
                    <button
                      type="button"
                      onClick={() => setLeadFromDb(false)}
                      className="hover:text-foreground"
                      title="Limpar seleção"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  value={leadName}
                  onChange={(e) => {
                    setLeadName(e.target.value);
                    setLeadFromDb(false);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Ex.: Empresa XYZ"
                  autoComplete="off"
                />
                {searchingLeads && (
                  <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              {showSuggestions && !leadFromDb && debouncedName.length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-input bg-popover shadow-lg">
                  {leadSuggestions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      {searchingLeads
                        ? "Buscando leads…"
                        : "Nenhum lead encontrado no banco — pode cadastrar manualmente."}
                    </p>
                  ) : (
                    leadSuggestions.map((l) => {
                      const meta = [
                        l.closerId ? `Closer: ${closerNameById.get(l.closerId) ?? "—"}` : null,
                        l.sdrId ? `SDR: ${sdrNameById.get(l.sdrId) ?? "—"}` : null,
                        l.channelType ? `Canal: ${l.channelType}` : null,
                        l.scheduledDate
                          ? `Última reunião: ${format(new Date(`${l.scheduledDate}T12:00:00`), "dd/MM/yyyy")}`
                          : null,
                      ].filter(Boolean) as string[];
                      return (
                        <button
                          key={`${l.name}-${l.phone}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setLeadName(l.name);
                            setLeadPhone(formatPhone(l.phone));
                            if (l.closerId) setCloserId(l.closerId);
                            setSdrId(l.sdrId ?? "none");
                            if (l.channelType && channelTypes.includes(l.channelType)) {
                              setChannelType(l.channelType);
                            }
                            setLeadFromDb(true);
                            setShowSuggestions(false);
                          }}
                          className="block w-full border-b border-input/30 px-3 py-2 text-left last:border-b-0 hover:bg-secondary/60"
                        >
                          <p className="text-sm font-medium">{l.name}</p>
                          <p className="text-xs text-muted-foreground">{l.phone || "sem telefone"}</p>
                          {meta.length > 0 && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground/80">{meta.join(" · ")}</p>
                          )}
                        </button>
                      );
                    })

                  )}
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Telefone (WhatsApp) *</Label>
              <Input
                inputMode="tel"
                value={leadPhone}
                onChange={(e) => setLeadPhone(formatPhone(e.target.value))}
                placeholder="(11) 99999-9999"
              />
            </div>
          </div>


          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Data da venda *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("justify-start font-normal", !saleDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(saleDate, "dd 'de' MMMM yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={saleDate} onSelect={(d) => d && setSaleDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-2">
              <Label>Canal *</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger><SelectValue placeholder="Selecione o canal" /></SelectTrigger>
                <SelectContent>
                  {channelTypes.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>SDR (opcional)</Label>
              <Select value={sdrId} onValueChange={setSdrId}>
                <SelectTrigger><SelectValue placeholder="Sem SDR" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem SDR</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Closer *</Label>
              <Select value={closerId} onValueChange={setCloserId}>
                <SelectTrigger><SelectValue placeholder="Selecione o closer" /></SelectTrigger>
                <SelectContent>
                  {closers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Produto vendido *</Label>
            {produtosList.length > 0 ? (
              <Select value={produto} onValueChange={setProduto}>
                <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {produtosList.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Nome do produto" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Valor coletado (R$) *</Label>
              <Input
                inputMode="decimal"
                value={valorColetado}
                onChange={(e) => setValorColetado(e.target.value)}
                placeholder="Ex.: 5000,00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Valor total do projeto (R$) *</Label>
              <Input
                inputMode="decimal"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
                placeholder="Ex.: 15000,00"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Descrição do cliente / o que faz *</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Breve descrição da empresa, segmento, contexto da venda..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{descricao.trim().length} caracteres (mínimo 10)</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</> : "Registrar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
