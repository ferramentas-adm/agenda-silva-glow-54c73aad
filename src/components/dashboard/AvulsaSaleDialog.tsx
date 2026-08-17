import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, PlusCircle } from "lucide-react";

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
    if (!open) {
      setLeadName(""); setLeadPhone(""); setChannelType(""); setSdrId("none"); setCloserId("");
      setProduto(""); setValorColetado(""); setValorTotal(""); setDescricao("");
      setSaleDate(new Date()); setSaving(false);
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
          <div className="grid gap-2">
            <Label>Nome do cliente *</Label>
            <Input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Ex.: Empresa XYZ" />
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
