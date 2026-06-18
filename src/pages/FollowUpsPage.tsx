import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isBefore, isToday, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarClock, CheckCircle2, XCircle, RotateCw, Phone, Loader2, CalendarIcon,
  Pencil, Trash2, Filter, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppSettingList, APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { DEFAULT_REASONS, isPendingStageReason } from "@/lib/vendaConstants";
import { sendVendaToDataCrazy } from "@/services/datacrazyVenda";
import { logAudit } from "@/services/auditLog";
import FollowUpEditDialog, { removeFollowUp, type FollowUpEditTarget } from "@/components/FollowUpEditDialog";
import TasksSection from "@/components/tasks/TasksSection";
import { useCan } from "@/hooks/usePermissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NaoAcompanhadosPanel from "@/components/NaoAcompanhadosPanel";

interface FollowUpRow {
  id: string;
  agendamento_id: string;
  follow_up_date: string;
  follow_up_time: string | null;
  motivo_nao_fechamento: string | null;
  explicacao_nao_fechamento: string | null;
  observacoes: string | null;
  valor: number | null;
  agendamentos: {
    lead_name: string;
    lead_phone: string;
    closer_id: string | null;
    closers: { name: string } | null;
  } | null;
}

const formatBRL = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return "";
  const padded = cleaned.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/^0+(?=\d)/, "");
  const cents = padded.slice(-2);
  const reaisFmt = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${reaisFmt},${cents}`;
};
const digitsToNumber = (digits: string) => {
  const cleaned = digits.replace(/\D/g, "");
  if (!cleaned) return NaN;
  return parseInt(cleaned, 10) / 100;
};

export default function FollowUpsPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isCloser = role === "closer";
  const isManager = role === "gestor" || role === "moderador";
  const isGestor = role === "gestor";
  const [activeTab, setActiveTab] = useState<"em-acompanhamento" | "nao-acompanhados">("em-acompanhamento");

  // Descobre o closer_id do usuário (se for closer)
  const { data: myCloserId } = useQuery({
    queryKey: ["my-closer-id", user?.email],
    enabled: isCloser && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id").eq("email", user!.email!).maybeSingle();
      return data?.id ?? null;
    },
  });

  const { data: followUps = [], isLoading, refetch } = useQuery({
    queryKey: ["follow-ups", myCloserId, isManager],
    enabled: isManager || !!myCloserId,
    queryFn: async () => {
      let query = supabase
        .from("vendas")
        .select(`
          id, agendamento_id, follow_up_date, follow_up_time,
          motivo_nao_fechamento, explicacao_nao_fechamento, observacoes, valor,
          agendamentos!inner ( lead_name, lead_phone, closer_id, closers ( name ) )
        `)
        .eq("follow_up", true)
        .eq("vendeu", false)
        .order("follow_up_date", { ascending: true })
        .order("follow_up_time", { ascending: true, nullsFirst: false });

      if (isCloser && myCloserId) {
        query = query.eq("agendamentos.closer_id", myCloserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRow[];
    },
  });

  // Lista de motivos para filtro
  const { items: motivosList } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );

  // Lista de closers (apenas gestor/moderador filtra)
  const { data: closersList = [] } = useQuery({
    queryKey: ["follow-ups-closers"],
    enabled: isManager,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name").eq("active", true).order("name");
      return data ?? [];
    },
  });

  // Filtros
  const [filterCloser, setFilterCloser] = useState<string>("all");
  const [filterMotivo, setFilterMotivo] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<Date | undefined>(undefined);
  const [filterSearch, setFilterSearch] = useState("");
  const [sortMode, setSortMode] = useState<"date_asc" | "date_desc" | "time_asc">("date_asc");

  const hasActiveFilters =
    filterCloser !== "all" || filterMotivo !== "all" || !!filterDate || !!filterSearch.trim();

  const clearFilters = () => {
    setFilterCloser("all");
    setFilterMotivo("all");
    setFilterDate(undefined);
    setFilterSearch("");
  };

  const filteredFollowUps = useMemo(() => {
    return followUps.filter((f) => {
      if (filterCloser !== "all" && f.agendamentos?.closer_id !== filterCloser) return false;
      if (filterMotivo !== "all" && (f.motivo_nao_fechamento || "") !== filterMotivo) return false;
      if (filterDate && f.follow_up_date !== format(filterDate, "yyyy-MM-dd")) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        const lead = (f.agendamentos?.lead_name || "").toLowerCase();
        const phone = (f.agendamentos?.lead_phone || "").toLowerCase();
        if (!lead.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [followUps, filterCloser, filterMotivo, filterDate, filterSearch]);

  // Ordenação aplicada dentro de cada grupo
  const sortFollowUps = (list: FollowUpRow[]): FollowUpRow[] => {
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortMode === "time_asc") {
        // Por horário (asc), data como desempate
        const tCmp = (a.follow_up_time || "99:99").localeCompare(b.follow_up_time || "99:99");
        if (tCmp !== 0) return tCmp;
        return a.follow_up_date.localeCompare(b.follow_up_date);
      }
      const dCmp = sortMode === "date_desc"
        ? b.follow_up_date.localeCompare(a.follow_up_date)
        : a.follow_up_date.localeCompare(b.follow_up_date);
      if (dCmp !== 0) return dCmp;
      return sortMode === "date_desc"
        ? (b.follow_up_time || "").localeCompare(a.follow_up_time || "")
        : (a.follow_up_time || "99:99").localeCompare(b.follow_up_time || "99:99");
    });
    return sorted;
  };

  const today = startOfToday();
  const grouped = useMemo(() => {
    const overdue: FollowUpRow[] = [];
    const todayList: FollowUpRow[] = [];
    const upcoming: FollowUpRow[] = [];
    for (const f of filteredFollowUps) {
      const d = parseISO(f.follow_up_date);
      if (isToday(d)) todayList.push(f);
      else if (isBefore(d, today)) overdue.push(f);
      else upcoming.push(f);
    }
    return {
      overdue: sortFollowUps(overdue),
      todayList: sortFollowUps(todayList),
      upcoming: sortFollowUps(upcoming),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredFollowUps, today, sortMode]);

  const [actionTarget, setActionTarget] = useState<FollowUpRow | null>(null);
  const [editTarget, setEditTarget] = useState<FollowUpEditTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FollowUpRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const ok = await removeFollowUp(
      removeTarget.id,
      removeTarget.agendamento_id,
      removeTarget.agendamentos?.lead_name,
    );
    setRemoving(false);
    if (ok) {
      setRemoveTarget(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-primary" />
              {isManager ? "Follow-ups" : "Meus Follow-ups"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isManager
                ? "Gestão de retornos com leads que ainda não fecharam."
                : "Organize seus retornos com leads que ainda não fecharam."}
            </p>
          </div>
        </header>

        {isManager && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="em-acompanhamento">Em acompanhamento</TabsTrigger>
              <TabsTrigger value="nao-acompanhados">Não acompanhados</TabsTrigger>
            </TabsList>
            <TabsContent value="nao-acompanhados" className="mt-4">
              <NaoAcompanhadosPanel />
            </TabsContent>
          </Tabs>
        )}

        {(!isManager || activeTab === "em-acompanhamento") && (
          <>
        {/* Tarefas avulsas */}
        <TasksSection />

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mr-1">
                <Filter className="h-4 w-4" />
                Filtros
              </div>

              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">Buscar lead</Label>
                <Input
                  placeholder="Nome ou telefone"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs">Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 w-full justify-start text-left font-normal",
                        !filterDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {filterDate ? format(filterDate, "dd/MM/yyyy", { locale: ptBR }) : "Qualquer"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDate} onSelect={setFilterDate} locale={ptBR} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="min-w-[160px]">
                <Label className="text-xs">Motivo</Label>
                <Select value={filterMotivo} onValueChange={setFilterMotivo}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {motivosList.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isManager && (
                <div className="min-w-[160px]">
                  <Label className="text-xs">Closer</Label>
                  <Select value={filterCloser} onValueChange={setFilterCloser}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {closersList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="min-w-[180px]">
                <Label className="text-xs">Ordenar por</Label>
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as typeof sortMode)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date_asc">Mais próximos primeiro</SelectItem>
                    <SelectItem value="date_desc">Mais distantes primeiro</SelectItem>
                    <SelectItem value="time_asc">Por horário (mais cedo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar
                </Button>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              {filteredFollowUps.length} de {followUps.length} follow-up{followUps.length !== 1 ? "s" : ""}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFollowUps.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {followUps.length === 0
                ? "Nenhum follow-up agendado no momento."
                : "Nenhum follow-up corresponde aos filtros aplicados."}
            </CardContent>
          </Card>
        ) : (
          <>
            <FollowUpSection
              title="Atrasados"
              variant="overdue"
              items={grouped.overdue}
              onAction={setActionTarget}
              onEdit={setEditTarget}
              onRemove={setRemoveTarget}
              showCloser={isManager}
            />
            <FollowUpSection
              title="Hoje"
              variant="today"
              items={grouped.todayList}
              onAction={setActionTarget}
              onEdit={setEditTarget}
              onRemove={setRemoveTarget}
              showCloser={isManager}
            />
            <FollowUpSection
              title="Próximos"
              variant="upcoming"
              items={grouped.upcoming}
              onAction={setActionTarget}
              onEdit={setEditTarget}
              onRemove={setRemoveTarget}
              showCloser={isManager}
            />
          </>
        )}

        {actionTarget && (
          <FollowUpActionDialog
            row={actionTarget}
            onClose={() => setActionTarget(null)}
            onDone={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
              queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
            }}
          />
        )}

        <FollowUpEditDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
            queryClient.invalidateQueries({ queryKey: ["vendas-tab"] });
          }}
        />

        <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && !removing && setRemoveTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Descartar follow-up?</AlertDialogTitle>
              <AlertDialogDescription>
                O lead <strong>{removeTarget?.agendamentos?.lead_name}</strong> será movido para a lista de
                <strong> Leads não acompanhados</strong>. Você pode registrar um novo follow-up depois pelo botão "Próximo passo".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirmRemove(); }}
                disabled={removing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </>
        )}
      </div>
    </AppLayout>
  );
}

/* ----------------------------- Section ----------------------------- */
function FollowUpSection({
  title,
  variant,
  items,
  onAction,
  onEdit,
  onRemove,
  showCloser,
}: {
  title: string;
  variant: "overdue" | "today" | "upcoming";
  items: FollowUpRow[];
  onAction: (r: FollowUpRow) => void;
  onEdit: (t: FollowUpEditTarget) => void;
  onRemove: (r: FollowUpRow) => void;
  showCloser?: boolean;
}) {
  if (items.length === 0) return null;
  const badgeClass =
    variant === "overdue"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : variant === "today"
        ? "bg-primary/15 text-primary border-primary/30"
        : "bg-muted text-muted-foreground border-border";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline" className={badgeClass}>
          {items.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((f) => (
          <FollowUpItem
            key={f.id}
            row={f}
            onAction={onAction}
            onEdit={onEdit}
            onRemove={onRemove}
            showCloser={showCloser}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function FollowUpItem({
  row,
  onAction,
  onEdit,
  onRemove,
  showCloser,
}: {
  row: FollowUpRow;
  onAction: (r: FollowUpRow) => void;
  onEdit: (t: FollowUpEditTarget) => void;
  onRemove: (r: FollowUpRow) => void;
  showCloser?: boolean;
}) {
  const date = parseISO(row.follow_up_date);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{row.agendamentos?.lead_name ?? "Lead"}</span>
          {row.agendamentos?.lead_phone && (
            <a
              href={`tel:${row.agendamentos.lead_phone}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <Phone className="h-3 w-3" />
              {row.agendamentos.lead_phone}
            </a>
          )}
          {showCloser && row.agendamentos?.closers?.name && (
            <Badge variant="secondary" className="text-[10px]">
              {row.agendamentos.closers.name}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {format(date, "EEEE, dd/MM/yyyy", { locale: ptBR })}
          {row.follow_up_time && ` · ${row.follow_up_time}`}
        </div>
        {row.motivo_nao_fechamento && (
          <p className="text-xs text-foreground/80 mt-1.5 whitespace-pre-wrap">
            <span className="font-semibold text-muted-foreground">Motivo: </span>
            {row.motivo_nao_fechamento}
          </p>
        )}
        {row.explicacao_nao_fechamento && (
          <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">
            <span className="font-semibold text-muted-foreground">Explicação: </span>
            {row.explicacao_nao_fechamento}
          </p>
        )}
        {row.observacoes && (
          <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap">
            <span className="font-semibold text-muted-foreground">Resumo: </span>
            {row.observacoes}
          </p>
        )}
      </div>
      <div className="flex gap-1.5 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          onClick={() =>
            onEdit({
              id: row.id,
              agendamento_id: row.agendamento_id,
              follow_up_date: row.follow_up_date,
              follow_up_time: row.follow_up_time,
              motivo_nao_fechamento: row.motivo_nao_fechamento,
              observacoes: row.observacoes,
              lead_name: row.agendamentos?.lead_name,
            })
          }
          title="Editar"
          className="h-8 w-8"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onRemove(row)}
          title="Remover"
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction(row)}>
          Próximo passo
        </Button>
      </div>
    </div>
  );
}

/* ------------------------- Action Dialog ------------------------- */
function FollowUpActionDialog({
  row,
  onClose,
  onDone,
}: {
  row: FollowUpRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { items: motivosNaoFechamento } = useAppSettingList(
    APP_SETTING_KEYS.motivos_nao_fechamento,
    DEFAULT_REASONS,
  );
  const { items: produtosList } = useAppSettingList(APP_SETTING_KEYS.produtos, []);


  // IMPORTANTE: todos os campos começam SEMPRE em branco para evitar
  // que dados de leads anteriores apareçam por engano no próximo follow-up.
  const [outcome, setOutcome] = useState<"fechou" | "perdeu" | "reagendar" | null>(null);
  const [valor, setValor] = useState("");
  const [resumoVenda, setResumoVenda] = useState("");
  const [produto, setProduto] = useState("");

  const [dataVenda, setDataVenda] = useState<Date | undefined>(undefined);
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState<Date | undefined>(undefined);
  const [novoHorario, setNovoHorario] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const motivoIsPending = isPendingStageReason(motivo);

  // Sempre que abrir/trocar de lead, limpa tudo — não pré-popula com dados antigos.
  useEffect(() => {
    setOutcome(null);
    setValor("");
    setResumoVenda("");
    setDataVenda(startOfToday());
    setMotivo("");
    setNovaData(undefined);
    setNovoHorario("");
    setObservacoes("");
  }, [row.id]);


  const valorNum = digitsToNumber(valor);
  const valorValido = !isNaN(valorNum) && valorNum > 0;

  const canSubmit = (() => {
    if (!outcome) return false;
    if (outcome === "fechou") return resumoVenda.trim().length > 0 && valorValido && !!dataVenda;
    if (outcome === "perdeu") return !!motivo;
    if (outcome === "reagendar") return !!novaData && !!novoHorario;
    return false;
  })();

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      let updatePayload: Record<string, unknown>;
      let outcomeType: "fechou" | "perdeu" | "follow_up" | "em_andamento" = "perdeu";

      if (outcome === "fechou") {
        outcomeType = "fechou";
        updatePayload = {
          vendeu: true,
          resumo_venda: resumoVenda.trim(),
          valor: valorNum,
          follow_up: false,
          follow_up_date: null,
          follow_up_time: null,
          motivo_nao_fechamento: null,
          observacoes: observacoes.trim() || null,
          closed_at: dataVenda ? format(dataVenda, "yyyy-MM-dd") : null,
        };

      } else if (outcome === "perdeu") {
        outcomeType = motivoIsPending ? "em_andamento" : "perdeu";
        updatePayload = {
          vendeu: false,
          resumo_venda: null,
          follow_up: false,
          follow_up_date: null,
          follow_up_time: null,
          motivo_nao_fechamento: motivo,
          observacoes: observacoes.trim() || null,
        };
      } else {
        outcomeType = "follow_up";
        updatePayload = {
          vendeu: false,
          follow_up: true,
          follow_up_date: format(novaData!, "yyyy-MM-dd"),
          follow_up_time: novoHorario,
          motivo_nao_fechamento: motivo || row.motivo_nao_fechamento,
          observacoes: observacoes.trim() || null,
        };
      }

      const { data: updatedVenda, error } = await supabase
        .from("vendas")
        .update(updatePayload)
        .eq("id", row.id)
        .select("id")
        .single();
      if (error) throw error;
      if (!updatedVenda) throw new Error("O resultado não foi salvo. Tente novamente.");

      // Webhook DataCrazy
      const { data: agData } = await supabase
        .from("agendamentos")
        .select("lead_name, lead_phone, closer_id, sdr_responsavel_id, created_by")
        .eq("id", row.agendamento_id)
        .maybeSingle();

      let closerName: string | null = null;
      let sdrName: string | null = null;
      if (agData?.closer_id) {
        const { data: c } = await supabase.from("closers").select("name").eq("id", agData.closer_id).maybeSingle();
        closerName = c?.name ?? null;
      }
      const sdrLookup = agData?.sdr_responsavel_id ?? agData?.created_by;
      if (sdrLookup) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", sdrLookup).maybeSingle();
        sdrName = p?.full_name ?? null;
      }

      sendVendaToDataCrazy({
        agendamento_id: row.agendamento_id,
        lead_name: agData?.lead_name ?? row.agendamentos?.lead_name ?? "",
        lead_phone: agData?.lead_phone ?? row.agendamentos?.lead_phone ?? null,
        closer_name: closerName,
        sdr_name: sdrName,
        vendeu: outcome === "fechou",
        resumo_venda: outcome === "fechou" ? resumoVenda.trim() : null,
        valor: outcome === "fechou" ? valorNum : null,
        motivo_nao_fechamento: outcome !== "fechou" ? (motivo || row.motivo_nao_fechamento) : null,
        follow_up: outcome === "reagendar",
        follow_up_date: outcome === "reagendar" && novaData ? format(novaData, "yyyy-MM-dd") : null,
        follow_up_time: outcome === "reagendar" ? novoHorario : null,
        observacoes: observacoes.trim() || null,
        outcome: outcomeType,
        registered_at: new Date().toISOString(),
      });

      await logAudit("follow_up_atualizado", "venda", row.agendamento_id, {
        lead_name: row.agendamentos?.lead_name,
        outcome: outcomeType,
        valor: outcome === "fechou" ? valorNum : null,
        motivo: outcome !== "fechou" ? motivo : null,
      });

      toast.success(
        outcome === "fechou" ? "Venda fechada!" :
          outcome === "perdeu" ? "Lead marcado como perdido" :
            "Novo follow-up agendado",
      );
      onDone();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar próximo passo");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open onOpenChange={(o) => !submitting && !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Próximo passo do follow-up</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{row.agendamentos?.lead_name}</span> — registre o desfecho deste contato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={outcome === "fechou" ? "default" : "outline"}
              onClick={() => setOutcome("fechou")}
              className="flex-col h-auto py-3 gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs">Fechou</span>
            </Button>
            <Button
              type="button"
              variant={outcome === "perdeu" ? "default" : "outline"}
              onClick={() => setOutcome("perdeu")}
              className="flex-col h-auto py-3 gap-1"
            >
              <XCircle className="h-4 w-4" />
              <span className="text-xs">Perdeu</span>
            </Button>
            <Button
              type="button"
              variant={outcome === "reagendar" ? "default" : "outline"}
              onClick={() => setOutcome("reagendar")}
              className="flex-col h-auto py-3 gap-1"
            >
              <RotateCw className="h-4 w-4" />
              <span className="text-xs">Novo Follow-up</span>
            </Button>
          </div>

          {outcome === "fechou" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="resumo-fu">Resumo da venda *</Label>
                <Textarea
                  id="resumo-fu"
                  value={resumoVenda}
                  onChange={(e) => setResumoVenda(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valor-fu">Valor coletado *</Label>
                <Input
                  id="valor-fu"
                  inputMode="numeric"
                  value={formatBRL(valor)}
                  onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data da venda *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dataVenda && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataVenda ? format(dataVenda, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataVenda}
                      onSelect={setDataVenda}
                      disabled={(d) => d > new Date()}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-[11px] text-muted-foreground">
                  Selecione o dia em que a venda realmente aconteceu (pode ser anterior a hoje).
                </p>
              </div>
            </>
          )}

          {outcome === "perdeu" && (
            <div className="space-y-2">
              <Label>Motivo *</Label>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {motivosNaoFechamento.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {motivoIsPending && (
                <p className="text-xs text-muted-foreground">
                  Marcado como etapa em andamento no CRM.
                </p>
              )}
            </div>
          )}

          {outcome === "reagendar" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Data do novo follow-up *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !novaData && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {novaData ? format(novaData, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={novaData}
                      onSelect={setNovaData}
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="novo-horario">Horário *</Label>
                <Input
                  id="novo-horario"
                  type="time"
                  value={novoHorario}
                  onChange={(e) => setNovoHorario(e.target.value)}
                />
              </div>
            </div>
          )}

          {outcome && (
            <div className="space-y-1.5">
              <Label htmlFor="obs-fu">Observações</Label>
              <Textarea
                id="obs-fu"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
