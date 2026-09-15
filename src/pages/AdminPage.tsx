import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAuthUrl } from "@/hooks/useGoogleCalendar";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Users, AlertCircle,
  Loader2, Pencil, Trash2, Settings, Save, X, Check, KeyRound, Eye, EyeOff, ArrowRightLeft, Copy, RefreshCw, Clock, Search, CalendarPlus, CalendarX, Plus, ShieldAlert, ShieldCheck, UserCog, PhoneCall, Video, Send,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { parseDeletionReasons, type DeletionReason } from "@/hooks/useDeletionReasons";
import DynamicListManager from "@/components/DynamicListManager";
import { APP_SETTING_KEYS } from "@/hooks/useAppSettingList";
import { useSlotLimit } from "@/hooks/useSlotLimit";
import { useCloserSlotLimit } from "@/hooks/useCloserSlotLimit";
import MeetRolloutPanel from "@/components/admin/MeetRolloutPanel";
import CrmBulkVendasPanel from "@/components/admin/CrmBulkVendasPanel";
import PermissionsMatrix from "@/components/admin/PermissionsMatrix";
import BloqueiosSection from "@/components/admin/BloqueiosSection";
import { logAudit } from "@/services/auditLog";
import { DEFAULT_ORDER_BUMPS } from "@/lib/orderBumps";
import { DEFAULT_BOOKING_CHANNELS } from "@/hooks/useAppSettingList";

// Escopo do Google necessário para criar salas do Meet com gravação automática.
const MEET_SPACE_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";


/* ─── Listas dinâmicas (Canais / Motivos / Justificativas) ───── */
function DynamicListsSection() {
  return (
    <div className="space-y-4">
      <SlotLimitSetting />
        <CloserSlotLimitSetting />
      <div className="grid gap-4 md:grid-cols-2">
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.channel_types}
          title="Origens do lead"
          description="Origem do lead para classificação."
          defaults={["CTA", "Formulário Bio", "Indicação", "Reativação", "Renovação", "Social Selling", "Tráfego Pago"]}
        />
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.block_reasons}
          title="Motivos de compromissos pessoais"
          description="Opções para o Closer ao bloquear horários."
          defaults={["Almoço", "Compromisso pessoal", "Folga", "Reunião interna", "Treinamento"]}
        />
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.motivos_nao_fechamento}
          title="Motivos de não fechamento"
          description="Opções no pop-up de venda quando 'Vendeu? Não'."
          defaults={["Expectativas desalinhadas", "Não é o momento", "Sem capacidade financeira"]}
        />
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.produtos}
          title="Produtos"
          description="Lista de produtos disponíveis para registro de venda."
          defaults={[]}
        />
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.closer_error_categories}
          title="Categorias de erro do Closer"
          description="Opções de categoria ao apontar um erro do Closer nos motivos de não fechamento."
          defaults={["Discovery raso", "Não criou urgência", "Objeção mal contornada", "Quebra de rapport", "Não ofertou preço"]}
        />
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.no_show_reasons}
          title="Motivos de não comparecimento"
          description="Opções exibidas ao marcar 'Não compareceu' em uma reunião."
          defaults={["No-show", "Cancelou por imprevisto pessoal", "Cancelou por desistência", "Alterou horário para o mesmo dia", "Outros"]}
        />

        <DynamicListManager
          settingKey={APP_SETTING_KEYS.booking_channels}
          title="Canal do agendamento"
          description="Canais que o SDR pode escolher ao marcar a reunião."
          defaults={DEFAULT_BOOKING_CHANNELS}
        />
        <DynamicListManager
          settingKey={APP_SETTING_KEYS.order_bumps}
          title="Order bumps"
          description="Itens adicionais que podem ser marcados no registro da venda (nome + valor)."
          defaults={DEFAULT_ORDER_BUMPS}
        />




      </div>
      <DeletionReasonsSection />
    </div>
  );
}

/* ─── Limite global de agendas por horário ───── */
function SlotLimitSetting() {
  const { limit, isLoading, save, isSaving } = useSlotLimit();
  const [value, setValue] = useState<string>("");
  useEffect(() => { if (!isLoading) setValue(String(limit)); }, [limit, isLoading]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 text-sm font-semibold">Limite de agendas por horário</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Quando esse limite for atingido, SDRs não podem mais marcar nesse horário. Gestores/moderadores podem forçar.
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28"
        />
        <Button
          size="sm"
          disabled={isSaving || !value || parseInt(value, 10) === limit || parseInt(value, 10) < 1}
          onClick={() => save(parseInt(value, 10))}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}

/* ─── Limite de reuniões por Closer no mesmo horário ───── */
function CloserSlotLimitSetting() {
  const { limit, isLoading, save, isSaving } = useCloserSlotLimit();
  const [value, setValue] = useState<string>("");
  useEffect(() => { if (!isLoading) setValue(String(limit)); }, [limit, isLoading]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-1 text-sm font-semibold">Limite de reuniões por Closer no mesmo horário</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Quantas reuniões um mesmo Closer pode ter no mesmo dia e horário. Usado na validação da atribuição e no contador exibido em "Aguardando atribuição".
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28"
        />
        <Button
          size="sm"
          disabled={isSaving || !value || parseInt(value, 10) === limit || parseInt(value, 10) < 1}
          onClick={() => save(parseInt(value, 10))}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}


/* ─── Users Section (unified SDR + Closer management) ─────────── */

function UsersSection() {
  const { isGestor, isModerador, user, role: myRole } = useAuth();
  const canManageUsers = isGestor || isModerador;
  // Moderador não pode mexer em Gestores nem promover/criar Gestores
  const canActOn = (targetRole: string) => isGestor || (isModerador && targetRole !== "gestor");
  // Ativar/inativar: Gestor em qualquer conta; Moderador exceto Gestores, Moderadores e a própria conta
  const canToggleActive = (u: any) => {
    if (isGestor) return true;
    if (myRole !== "moderador") return false;
    if (u.role === "gestor" || u.role === "moderador") return false;
    if (u.userId && user?.id && u.userId === user.id) return false;
    return true;
  };


  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"sdr" | "gestor" | "closer" | "moderador" | "supervisor" | "apresentador">("sdr");
  const [creating, setCreating] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; name: string; type: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle active
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);

  // Password change state
  const [passwordChangeTarget, setPasswordChangeTarget] = useState<{ userId: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Password reset state (gera senha temporária automaticamente)
  const [resetTarget, setResetTarget] = useState<{ userId: string; name: string; email: string } | null>(null);
  const [resetGeneratedPassword, setResetGeneratedPassword] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Role change state
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ userId: string; name: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [changingRole, setChangingRole] = useState(false);

  // Closer hours edit state
  const [hoursTarget, setHoursTarget] = useState<{ closerId: string; name: string; ranges: { start: string; end: string }[] } | null>(null);
  const [editRanges, setEditRanges] = useState<{ start: string; end: string }[]>([{ start: "09:00", end: "23:00" }]);
  const [savingHours, setSavingHours] = useState(false);

  // Piloto: gravação/transcrição automática do Google Meet por closer
  const [autoRecTarget, setAutoRecTarget] = useState<{ closerId: string; name: string; enable: boolean } | null>(null);
  const [savingAutoRec, setSavingAutoRec] = useState(false);

  // Desconexão da conta Google de um closer (ação do gestor)
  const [disconnectGoogleTarget, setDisconnectGoogleTarget] = useState<{ closerId: string; name: string; hasMeetScope: boolean } | null>(null);
  const [savingDisconnectGoogle, setSavingDisconnectGoogle] = useState(false);




  // DataCrazy ID edit state
  const [ramalTarget, setRamalTarget] = useState<{ userId: string; name: string } | null>(null);
  const [editRamal, setEditRamal] = useState("");
  const [savingRamal, setSavingRamal] = useState(false);

  // Scheduling toggle
  const [togglingSchedulingId, setTogglingSchedulingId] = useState<string | null>(null);

  // Moderador subtype toggle (Moderador de SDR / Moderador de Closer)
  const [savingModTipoId, setSavingModTipoId] = useState<string | null>(null);
  const cycleModeradorTipo = async (u: any) => {
    setSavingModTipoId(u.userId);
    const next = u.moderadorTipo === null ? "sdr" : u.moderadorTipo === "sdr" ? "closer" : null;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ moderador_tipo: next } as any)
        .eq("user_id", u.userId);
      if (error) throw error;
      toast.success(next ? `Definido como Moderador de ${next === "sdr" ? "SDR" : "Closer"}` : "Subtipo de moderador removido");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar subtipo");
    }
    setSavingModTipoId(null);
  };

  // Fetch all users (profiles + roles) and closers
  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, active, available_for_scheduling, is_sdr_override, moderador_tipo, sdr_team, datacrazy_id, api4com_extension");
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");
      const { data: closers } = await supabase
        .from("closers")
        .select("id, name, email, active, business_hours_start, business_hours_end, business_hours_ranges, datacrazy_id, auto_recording_enabled, em_treinamento")
        .order("name");
      // Conexões Google dos closers (para status/desconexão no painel do gestor)
      const { data: googleTokens } = await supabase
        .from("closer_google_tokens")
        .select("closer_id, granted_scopes");
      const googleTokenMap = new Map<string, { hasMeetScope: boolean }>();
      (googleTokens ?? []).forEach((t: any) => {
        googleTokenMap.set(t.closer_id, {
          hasMeetScope: typeof t.granted_scopes === "string" && t.granted_scopes.includes(MEET_SPACE_SCOPE),
        });
      });


      // Build a map of closer info by email
      const closerMap = new Map<string, { closerId: string; hoursStart: string; hoursEnd: string; ranges: { start: string; end: string }[]; autoRecordingEnabled: boolean; emTreinamento: boolean }>();
      (closers ?? []).forEach((c: any) => {
        if (c.email) {
          const ranges = c.business_hours_ranges && Array.isArray(c.business_hours_ranges) && c.business_hours_ranges.length > 0
            ? c.business_hours_ranges
            : [{ start: c.business_hours_start || "09:00", end: c.business_hours_end || "23:00" }];
          closerMap.set(c.email.toLowerCase(), {
            closerId: c.id,
            hoursStart: c.business_hours_start || "09:00",
            hoursEnd: c.business_hours_end || "23:00",
            ranges,
            autoRecordingEnabled: c.auto_recording_enabled === true,
            emTreinamento: c.em_treinamento === true,
          });
        }
      });


      // Profile-based users (SDR, Gestor, Closer with auth)
      const profileEmails = new Set<string>();
      const profileUsers = (profiles ?? []).map((p: any) => {
        profileEmails.add(p.email?.toLowerCase());
        const userRole = roles?.find((r: any) => r.user_id === p.user_id)?.role ?? "sdr";
        const closerInfo = closerMap.get(p.email?.toLowerCase());
        return {
          id: p.id,
          userId: p.user_id,
          name: p.full_name,
          email: p.email,
          role: userRole,
          active: p.active !== false,
          type: "profile" as const,
          closerId: closerInfo?.closerId || null,
          hoursStart: closerInfo?.hoursStart || "09:00",
          hoursEnd: closerInfo?.hoursEnd || "23:00",
          ranges: closerInfo?.ranges || [{ start: "09:00", end: "23:00" }],
          autoRecordingEnabled: closerInfo?.autoRecordingEnabled === true,
          emTreinamento: closerInfo?.emTreinamento === true,
          googleConnected: closerInfo?.closerId ? googleTokenMap.has(closerInfo.closerId) : false,
          googleHasMeetScope: closerInfo?.closerId
            ? googleTokenMap.get(closerInfo.closerId)?.hasMeetScope === true
            : false,



          api4comExtension: (p as any).api4com_extension || "",
          availableForScheduling: p.available_for_scheduling ?? false,
          isSdrOverride: (p as any).is_sdr_override === true,
          moderadorTipo: (p as any).moderador_tipo as ("sdr" | "closer" | null) ?? null,
          sdrTeam: ((p as any).sdr_team as ("trafego" | "social_selling" | null)) ?? null,
        };
      });

      // Only show closers without auth accounts (legacy closers)
      const closerUsers = (closers ?? [])
        .filter((c: any) => !c.email || !profileEmails.has(c.email.toLowerCase()))
        .map((c: any) => {
          const ranges = c.business_hours_ranges && Array.isArray(c.business_hours_ranges) && c.business_hours_ranges.length > 0
            ? c.business_hours_ranges
            : [{ start: c.business_hours_start || "09:00", end: c.business_hours_end || "23:00" }];
          return {
            id: c.id,
            userId: c.id,
            name: c.name,
            email: c.email || "",
            role: "closer" as const,
            active: c.active,
            type: "closer" as const,
            closerId: c.id,
            hoursStart: c.business_hours_start || "09:00",
            hoursEnd: c.business_hours_end || "23:00",
            ranges,
            autoRecordingEnabled: c.auto_recording_enabled === true,
            emTreinamento: c.em_treinamento === true,
            googleConnected: googleTokenMap.has(c.id),
            googleHasMeetScope: googleTokenMap.get(c.id)?.hasMeetScope === true,


          };
        });

      return [...profileUsers, ...closerUsers];
    },
  });

  const visibleUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (allUsers as any[])
      .filter((u) => {
        if (filterRole !== "all" && u.role !== filterRole) return false;
        if (filterStatus === "active" && !u.active) return false;
        if (filterStatus === "inactive" && u.active) return false;
        if (!q) return true;
        return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const cmp = (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [allUsers, filterRole, filterStatus, searchQuery, sortDir]);

  const isFiltered = filterRole !== "all" || filterStatus !== "all" || searchQuery.trim().length > 0;

  const validatePassword = (pw: string): string[] => {
    const errs: string[] = [];
    if (pw.length < 8) errs.push("Mínimo 8 caracteres");
    if (!/[A-Z]/.test(pw)) errs.push("Pelo menos 1 letra maiúscula");
    if (!/[0-9]/.test(pw)) errs.push("Pelo menos 1 número");
    return errs;
  };

  const invokeEdgeFunction = async (fnName: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(fnName, { body });
    if (error) {
      // Try to get detailed message from response context
      try {
        const ctx = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          if (body?.error) throw new Error(body.error);
        }
      } catch (e: any) {
        if (e instanceof Error && e.message && e.message !== "Edge Function returned a non-2xx status code") throw e;
      }
      throw new Error(error.message || "Erro na operação");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setGeneratedPassword(null);
    try {
      const data = await invokeEdgeFunction("create-user", { email, full_name: fullName, role });
      
      setGeneratedPassword(data.generated_password);
      await logAudit("create_user", "user", data?.user_id, { email, full_name: fullName, role });
      toast.success("Usuário criado com sucesso!");
      setFullName(""); setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["closers"] });
      queryClient.invalidateQueries({ queryKey: ["closers-active"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    }
    setCreating(false);
  };

  const handleSaveEdit = async (user: any) => {
    setSavingEdit(true);
    try {
      if (user.type === "closer") {
        const { error } = await supabase.from("closers")
          .update({ name: editName, email: editEmail || null })
          .eq("id", user.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["closers"] });
        queryClient.invalidateQueries({ queryKey: ["closers-active"] });
      } else {
        // Edição global: propaga nome/e-mail para a conta de acesso, o perfil e o cadastro de closer.
        await invokeEdgeFunction("manage-user", {
          user_id: user.userId,
          action: "update_user",
          full_name: editName,
          email: editEmail,
        });
        queryClient.invalidateQueries({ queryKey: ["closers"] });
        queryClient.invalidateQueries({ queryKey: ["closers-active"] });
      }
      toast.success("Usuário atualizado!");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
    setSavingEdit(false);
  };


  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "closer") {
        const { error } = await supabase.from("closers").delete().eq("id", deleteTarget.userId);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["closers"] });
        queryClient.invalidateQueries({ queryKey: ["closers-active"] });
        await logAudit("delete_user", "closer", deleteTarget.userId, { name: deleteTarget.name });
      } else {
        await invokeEdgeFunction("manage-user", { user_id: deleteTarget.userId, action: "delete" });
        await logAudit("delete_user", "user", deleteTarget.userId, { name: deleteTarget.name });
      }
      toast.success("Usuário excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleToggleActive = async (user: any, desiredActive: boolean) => {
    if (togglingId) return; // impede cliques duplicados (evitava flip de status)
    if (!canToggleActive(user)) {
      toast.error("Apenas Administradores podem ativar/inativar contas de Moderador ou Administrador.");
      return;
    }
    setTogglingId(user.userId);
    try {
      if (user.type === "closer") {
        // Legacy closer without auth account
        const { error } = await supabase.from("closers")
          .update({ active: desiredActive })
          .eq("id", user.id);
        if (error) throw error;
      } else {
        // Profile-based user: envia o estado desejado explicitamente
        await invokeEdgeFunction("manage-user", { user_id: user.userId, action: "toggle_active", active: desiredActive });

        // If this user is a closer with a linked closer record, also toggle it
        if (user.role === "closer" && user.closerId) {
          await supabase.from("closers")
            .update({ active: desiredActive })
            .eq("id", user.closerId);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["closers"] });
      queryClient.invalidateQueries({ queryKey: ["closers-active"] });
      await logAudit("toggle_active", user.type === "closer" ? "closer" : "user", user.userId || user.id, { name: user.name, new_active: desiredActive });
      toast.success(desiredActive ? "Usuário ativado" : "Usuário desativado");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status");
    }
    setTogglingId(null);
  };

  const handleChangePassword = async () => {
    if (!passwordChangeTarget) return;
    const errs = validatePassword(newPassword);
    if (errs.length > 0) {
      toast.error(errs.join(", "));
      return;
    }
    setChangingPassword(true);
    try {
      await invokeEdgeFunction("manage-user", { user_id: passwordChangeTarget.userId, action: "change_password", new_password: newPassword });
      await logAudit("change_password", "user", passwordChangeTarget.userId, { name: (passwordChangeTarget as any).name });
      toast.success("Senha alterada com sucesso! O usuário precisará trocar a senha no próximo login.");
      setPasswordChangeTarget(null);
      setNewPassword("");
      setShowNewPassword(false);
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      console.error("[handleChangePassword] Error:", err);
      toast.error(err.message || "Erro ao alterar senha");
    }
    setChangingPassword(false);
  };

  // Gera senha temporária forte e segura (12 caracteres: maiúscula, minúscula, número, símbolo).
  const generateTemporaryPassword = (): string => {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I/O para evitar confusão visual
    const lower = "abcdefghijkmnpqrstuvwxyz"; // sem l/o
    const digits = "23456789"; // sem 0/1
    const symbols = "!@#$%&*";
    const all = upper + lower + digits + symbols;
    const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
    const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    for (let i = chars.length; i < 12; i++) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResettingPassword(true);
    setResetGeneratedPassword(null);
    try {
      const tempPassword = generateTemporaryPassword();
      await invokeEdgeFunction("manage-user", {
        user_id: resetTarget.userId,
        action: "change_password",
        new_password: tempPassword,
      });
      // A edge function `manage-user` já marca `must_change_password = true` automaticamente.
      setResetGeneratedPassword(tempPassword);
      toast.success("Senha temporária gerada. O usuário será obrigado a trocá-la no primeiro login.");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao redefinir senha");
    }
    setResettingPassword(false);
  };

  const handleChangeRole = async () => {
    if (!roleChangeTarget || !newRole) return;
    setChangingRole(true);
    try {
      await invokeEdgeFunction("manage-user", { user_id: roleChangeTarget.userId, action: "change_role", new_role: newRole });
      await logAudit("change_role", "user", roleChangeTarget.userId, { name: (roleChangeTarget as any).name, new_role: newRole });
      toast.success(`Função alterada para ${roleLabel(newRole)}`);
      setRoleChangeTarget(null);
      setNewRole("");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar função");
    }
    setChangingRole(false);
  };

  const handleToggleScheduling = async (user: any) => {
    setTogglingSchedulingId(user.userId);
    try {
      await invokeEdgeFunction("manage-user", { user_id: user.userId, action: "toggle_scheduling" });
      toast.success(user.availableForScheduling ? "Removido do agendamento" : "Disponível para agendamento");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["closers"] });
      queryClient.invalidateQueries({ queryKey: ["closers-active"] });
      queryClient.invalidateQueries({ queryKey: ["closers-availability"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar disponibilidade");
    }
    setTogglingSchedulingId(null);
  };

  const [togglingSdrOverrideId, setTogglingSdrOverrideId] = useState<string | null>(null);
  const [togglingTreinamentoId, setTogglingTreinamentoId] = useState<string | null>(null);

  const handleToggleTreinamento = async (user: any, nextValue: boolean) => {
    if (!user.closerId || user.emTreinamento === nextValue) return;
    setTogglingTreinamentoId(user.userId);
    try {
      const { error } = await supabase
        .from("closers")
        .update({ em_treinamento: nextValue })
        .eq("id", user.closerId);
      if (error) throw error;
      await logAudit(
        "toggle_closer_treinamento",
        "closer",
        user.closerId,
        {
          closer_name: user.name,
          previous: user.emTreinamento,
          current: nextValue,
        },
      );
      toast.success(nextValue ? "Closer alocado na Turma B" : "Closer alocado na Turma A");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (e: any) {
      toast.error(e.message || "Erro ao alterar turma do closer");
    } finally {
      setTogglingTreinamentoId(null);
    }
  };

  const handleToggleSdrOverride = async (user: any) => {
    setTogglingSdrOverrideId(user.userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_sdr_override: !user.isSdrOverride } as any)
        .eq("user_id", user.userId);
      if (error) throw error;
      toast.success(!user.isSdrOverride ? "Marcado como SDR" : "Override SDR removido");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-roles-map"] });
      queryClient.invalidateQueries({ queryKey: ["sdr-profiles-ranking"] });
      queryClient.invalidateQueries({ queryKey: ["profiles-list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar override SDR");
    }
    setTogglingSdrOverrideId(null);
  };

  const [savingSdrTeamId, setSavingSdrTeamId] = useState<string | null>(null);
  const handleChangeSdrTeam = async (user: any, team: "trafego" | "social_selling") => {
    setSavingSdrTeamId(user.userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ sdr_team: team } as any)
        .eq("user_id", user.userId);
      if (error) throw error;
      toast.success(`Time definido: ${team === "trafego" ? "Tráfego" : "Social Selling"}`);
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
      queryClient.invalidateQueries({ queryKey: ["sdr-teams-map"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir time");
    }
    setSavingSdrTeamId(null);
  };

  const roleLabel = (r: string) => {
    switch (r) {
      case "gestor": return "Admin";
      case "sdr": return "SDR";
      case "closer": return "Closer";
      case "moderador": return "Moderador";
      case "supervisor": return "Supervisor";
      default: return r;
    }
  };

  return (
    <div className="space-y-6">
      {/* Create user form — gestor only */}
      {canManageUsers && (
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <UserPlus className="h-4 w-4 text-primary" />
          Novo Usuário
        </h3>
        <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="flex gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sdr">SDR</SelectItem>
                {isGestor && <SelectItem value="gestor">Administrador</SelectItem>}
                <SelectItem value="closer">Closer</SelectItem>
                <SelectItem value="moderador">Moderador</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="apresentador">Apresentador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Uma senha aleatória será gerada automaticamente. O usuário deverá alterá-la no primeiro login.
          </p>
          <Button type="submit" disabled={creating} className="sm:col-span-2">
            {creating ? <Loader2 className="animate-spin" /> : "Criar Usuário"}
          </Button>
        </form>

        {generatedPassword && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-sm font-medium">✅ Usuário criado! Senha temporária:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-secondary px-3 py-2 font-mono text-sm select-all">
                {generatedPassword}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(generatedPassword);
                  toast.success("Senha copiada!");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Copie e envie esta senha para o usuário. Ele será obrigado a alterá-la no primeiro acesso.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Users list */}
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Usuários ({isFiltered ? `${visibleUsers.length} de ${allUsers.length}` : allUsers.length})
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ativos e inativos</SelectItem>
                <SelectItem value="active">Apenas ativos</SelectItem>
                <SelectItem value="inactive">Apenas inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortDir} onValueChange={(v) => setSortDir(v as typeof sortDir)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Nome: A → Z</SelectItem>
                <SelectItem value="desc">Nome: Z → A</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Filtrar por função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as funções</SelectItem>
                <SelectItem value="sdr">SDR</SelectItem>
                <SelectItem value="closer">Closer</SelectItem>
                <SelectItem value="gestor">Administrador</SelectItem>
                <SelectItem value="moderador">Moderador</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="apresentador">Apresentador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>


        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleUsers
              .map((u: any) => {
              const isEditing = editingId === u.userId;
              return (
                <div key={`${u.type}-${u.id}`} className="flex flex-col gap-2 rounded-lg bg-secondary/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input className="h-8 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Input className="h-8 text-sm" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="E-mail" />
                    </div>
                  ) : (
                    <div className="min-w-0 flex-1 lg:min-w-[220px]">
                      <p className="font-medium break-words leading-snug">{u.name}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {u.email && <p className="text-xs text-muted-foreground break-all">{u.email}</p>}
                        {u.role === "closer" && u.closerId && (
                          <span className="text-xs text-muted-foreground">
                            ({u.ranges.map((r: any) => `${r.start}–${r.end}`).join(", ")})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">

                    {isEditing ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(u)} disabled={savingEdit}>
                          {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-primary" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-primary">
                          {roleLabel(u.role)}
                          {u.role === "moderador" && u.moderadorTipo && (
                            <span className="ml-1 normal-case opacity-80">
                              de {u.moderadorTipo === "sdr" ? "SDR" : "Closer"}
                            </span>
                          )}
                        </span>
                        {u.role === "closer" && u.closerId && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              !u.googleConnected
                                ? "bg-destructive/10 text-destructive"
                                : u.googleHasMeetScope
                                  ? "bg-primary/10 text-primary"
                                  : "bg-yellow-500/10 text-yellow-500"
                            }`}
                            title={!u.googleConnected
                              ? "Google não conectado"
                              : u.googleHasMeetScope
                                ? "Google conectado com permissão de gravação automática"
                                : "Google conectado, mas sem a permissão de gravação automática — pedir reconexão"}
                          >
                            {!u.googleConnected
                              ? "sem Google"
                              : u.googleHasMeetScope
                                ? "Google + gravação"
                                : "Google (sem gravação)"}
                          </span>
                        )}
                        {u.isSdrOverride && u.role !== "sdr" && (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-500" title="Atua também como SDR (override)">
                            + SDR
                          </span>
                        )}
                        {/* Time do SDR — obrigatório para SDRs (por role) e overrides */}
                        {canActOn(u.role) && u.type === "profile" && (u.role === "sdr" || u.isSdrOverride) && (
                          <div className="flex items-center gap-1">
                            <Select
                              value={u.sdrTeam ?? ""}
                              onValueChange={(v) => handleChangeSdrTeam(u, v as "trafego" | "social_selling")}
                              disabled={savingSdrTeamId === u.userId}
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-7 w-[130px] text-[11px]",
                                  !u.sdrTeam && "border-destructive/60 text-destructive",
                                )}
                                title={u.sdrTeam ? "Time do SDR" : "Time obrigatório — defina Tráfego ou Social Selling"}
                              >
                                <SelectValue placeholder="⚠ Sem time" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="trafego">Tráfego</SelectItem>
                                <SelectItem value="social_selling">Social Selling</SelectItem>
                              </SelectContent>
                            </Select>
                            {savingSdrTeamId === u.userId && <Loader2 className="h-3 w-3 animate-spin" />}
                          </div>
                        )}
                        {canActOn(u.role) && u.type === "profile" && u.role === "moderador" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] font-semibold uppercase"
                            title="Alternar subtipo: Nenhum → Moderador de SDR → Moderador de Closer"
                            onClick={() => cycleModeradorTipo(u)}
                            disabled={savingModTipoId === u.userId}
                          >
                            {savingModTipoId === u.userId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : (u.moderadorTipo ? `tipo: ${u.moderadorTipo === "sdr" ? "SDR" : "Closer"}` : "definir tipo")}
                          </Button>
                        )}
                        {canActOn(u.role) && u.type === "profile" && u.role !== "closer" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={u.availableForScheduling ? "Remover da agenda" : "Liberar para agenda"}
                            onClick={() => handleToggleScheduling(u)}
                            disabled={togglingSchedulingId === u.userId}
                          >
                            {togglingSchedulingId === u.userId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CalendarPlus className={`h-3.5 w-3.5 ${u.availableForScheduling ? 'text-primary' : 'text-muted-foreground'}`} />
                            }
                          </Button>
                        )}
                        {canActOn(u.role) && (
                          <span
                            title={
                              canToggleActive(u)
                                ? (u.active ? "Inativar usuário" : "Ativar usuário")
                                : "Apenas Administradores podem ativar/inativar contas de Moderador ou Administrador"
                            }
                          >
                            <Switch
                              checked={u.active}
                              onCheckedChange={(v) => {
                                if (v) handleToggleActive(u, true);
                                else setDeactivateTarget(u);
                              }}
                              disabled={togglingId === u.userId || !canToggleActive(u)}
                            />
                          </span>
                        )}

                        {canActOn(u.role) && u.type === "profile" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Alterar função"
                            onClick={() => { setRoleChangeTarget({ userId: u.userId, name: u.name, currentRole: u.role }); setNewRole(u.role === "sdr" ? "gestor" : "sdr"); }}>
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canActOn(u.role) && u.type === "profile" && u.role !== "sdr" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={u.isSdrOverride ? "Atua como SDR (ativo) — clique para remover" : "Marcar como SDR (incluir em Métricas/Ranking/Produtividade/Erros SDR)"}
                            onClick={() => handleToggleSdrOverride(u)}
                            disabled={togglingSdrOverrideId === u.userId}
                          >
                            {togglingSdrOverrideId === u.userId
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <UserCog className={`h-3.5 w-3.5 ${u.isSdrOverride ? 'text-primary' : 'text-muted-foreground'}`} />}
                          </Button>
                        )}
                        {u.role === "closer" && u.closerId && canActOn(u.role) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={!u.googleConnected
                              ? "Google não conectado — o closer deve conectar pelo painel"
                              : u.googleHasMeetScope
                                ? "Google conectado (com permissão de gravação automática) — clique para desconectar"
                                : "Google conectado, mas SEM a permissão de gravação automática — clique para desconectar e pedir que reconecte"}
                            disabled={!u.googleConnected}
                            onClick={() => setDisconnectGoogleTarget({ closerId: u.closerId!, name: u.name, hasMeetScope: u.googleHasMeetScope === true })}
                          >
                            <CalendarX className={`h-3.5 w-3.5 ${
                              !u.googleConnected
                                ? 'text-muted-foreground'
                                : u.googleHasMeetScope
                                  ? 'text-primary'
                                  : 'text-yellow-500'
                            }`} />
                          </Button>
                        )}
                        {u.role === "closer" && u.closerId && canActOn(u.role) && (

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={u.autoRecordingEnabled
                              ? "Gravação automática do Meet: ATIVA (piloto) — clique para desativar"
                              : "Gravação automática do Meet: desativada — clique para ativar (piloto)"}
                            onClick={() => setAutoRecTarget({ closerId: u.closerId!, name: u.name, enable: !u.autoRecordingEnabled })}
                          >
                            <Video className={`h-3.5 w-3.5 ${u.autoRecordingEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                          </Button>
                        )}
                        {u.role === "closer" && u.closerId && canActOn(u.role) && (
                          <ToggleGroup
                            type="single"
                            value={u.emTreinamento ? "turma_b" : "turma_a"}
                            onValueChange={(value) => {
                              if (value) handleToggleTreinamento(u, value === "turma_b");
                            }}
                            disabled={togglingTreinamentoId === u.userId}
                            title={
                              u.emTreinamento
                                ? "Turma B: closer em treinamento — só recebe leads desqualificados"
                                : "Turma A: closer normal — recebe leads qualificados"
                            }
                            className="h-7 rounded-md border border-border bg-background p-0.5"
                          >
                            <ToggleGroupItem
                              value="turma_a"
                              aria-label="Turma A"
                              className="h-5 px-1.5 text-[10px] data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                            >
                              Turma A
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="turma_b"
                              aria-label="Turma B"
                              className="h-5 px-1.5 text-[10px] data-[state=on]:bg-amber-500 data-[state=on]:text-white"
                            >
                              Turma B
                            </ToggleGroupItem>
                          </ToggleGroup>
                        )}
                        {u.role === "closer" && u.closerId && (

                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Horário de trabalho"
                            onClick={() => { setHoursTarget({ closerId: u.closerId!, name: u.name, ranges: u.ranges }); setEditRanges([...u.ranges]); }}>
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canActOn(u.role) && (
                          <>
                            {u.type === "profile" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title={`Ramal API4COM${u.api4comExtension ? ': ' + u.api4comExtension : ' (não configurado)'}`}
                                onClick={() => { setRamalTarget({ userId: u.userId, name: u.name }); setEditRamal(u.api4comExtension || ""); }}>
                                <PhoneCall className={`h-3.5 w-3.5 ${u.api4comExtension ? 'text-primary' : 'text-muted-foreground'}`} />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Alterar senha (definir manualmente)"
                              onClick={() => { setPasswordChangeTarget({ userId: u.userId, name: u.name }); setNewPassword(""); setShowNewPassword(false); }}>
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Redefinir senha (gera senha temporária)"
                              onClick={() => { setResetTarget({ userId: u.userId, name: u.name, email: u.email || "" }); setResetGeneratedPassword(null); }}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(u.userId); setEditName(u.name); setEditEmail(u.email); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ userId: u.userId, name: u.name, type: u.type })}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {allUsers.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum usuário cadastrado.</p>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password change dialog */}
      <AlertDialog open={!!passwordChangeTarget} onOpenChange={(open) => { if (!open) { setPasswordChangeTarget(null); setNewPassword(""); setShowNewPassword(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar senha</AlertDialogTitle>
            <AlertDialogDescription>
              Defina uma nova senha para <strong>{passwordChangeTarget?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="Nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword && validatePassword(newPassword).length > 0 && (
              <div className="flex flex-col gap-0.5">
                {validatePassword(newPassword).map((err) => (
                  <p key={err} className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />{err}
                  </p>
                ))}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangePassword} disabled={changingPassword || !newPassword || validatePassword(newPassword).length > 0}>
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "Alterar senha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset password dialog (gera senha temporária e força troca no primeiro login) */}
      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetGeneratedPassword(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              Redefinir senha
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {resetGeneratedPassword ? (
                <span className="block">
                  Senha temporária gerada para <strong>{resetTarget?.name}</strong>.
                  Copie e envie ao usuário por canal seguro. No próximo login ele será obrigado a definir uma nova senha.
                </span>
              ) : (
                <span className="block">
                  Será gerada uma <strong>senha temporária</strong> para <strong>{resetTarget?.name}</strong>
                  {resetTarget?.email ? <> ({resetTarget.email})</> : null}.
                  O usuário será <strong>obrigado a trocá-la</strong> no primeiro login.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {resetGeneratedPassword && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Senha temporária</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-secondary px-3 py-2 font-mono text-sm select-all break-all">
                  {resetGeneratedPassword}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(resetGeneratedPassword);
                    toast.success("Senha copiada!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                ⚠️ Esta senha não será exibida novamente. Copie agora.
              </p>
            </div>
          )}

          <AlertDialogFooter>
            {resetGeneratedPassword ? (
              <AlertDialogAction
                onClick={() => {
                  setResetTarget(null);
                  setResetGeneratedPassword(null);
                }}
              >
                Concluir
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    handleResetPassword();
                  }}
                  disabled={resettingPassword}
                >
                  {resettingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Gerar senha temporária"
                  )}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!roleChangeTarget} onOpenChange={(open) => { if (!open) { setRoleChangeTarget(null); setNewRole(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar função</AlertDialogTitle>
            <AlertDialogDescription>
              Alterar a função de <strong>{roleChangeTarget?.name}</strong> de{" "}
              <strong>{roleLabel(roleChangeTarget?.currentRole || "")}</strong> para:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a nova função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sdr">SDR</SelectItem>
                {isGestor && <SelectItem value="gestor">Administrador</SelectItem>}
                <SelectItem value="closer">Closer</SelectItem>
                <SelectItem value="moderador">Moderador</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="apresentador">Apresentador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangeRole} disabled={changingRole || !newRole || newRole === roleChangeTarget?.currentRole}>
              {changingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Closer hours dialog */}
      <AlertDialog open={!!hoursTarget} onOpenChange={(open) => { if (!open) setHoursTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Horário de trabalho</AlertDialogTitle>
            <AlertDialogDescription>
              Configure os turnos de trabalho de <strong>{hoursTarget?.name}</strong>. Adicione múltiplos turnos para intervalos (ex: almoço).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {editRanges.map((range, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Turno {idx + 1} - Início</label>
                  <Input type="time" value={range.start} onChange={(e) => { const nr = [...editRanges]; nr[idx] = { ...nr[idx], start: e.target.value }; setEditRanges(nr); }} className="font-mono" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fim</label>
                  <Input type="time" value={range.end} onChange={(e) => { const nr = [...editRanges]; nr[idx] = { ...nr[idx], end: e.target.value }; setEditRanges(nr); }} className="font-mono" />
                </div>
                {editRanges.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={() => setEditRanges(editRanges.filter((_, i) => i !== idx))}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setEditRanges([...editRanges, { start: "14:00", end: "18:00" }])}>
              + Adicionar turno
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingHours}
              onClick={async () => {
                if (!hoursTarget) return;
                setSavingHours(true);
                try {
                  const firstStart = editRanges[0]?.start || "09:00";
                  const lastEnd = editRanges[editRanges.length - 1]?.end || "23:00";
                  const { error } = await supabase.from("closers")
                    .update({
                      business_hours_start: firstStart,
                      business_hours_end: lastEnd,
                      business_hours_ranges: editRanges,
                    } as any)
                    .eq("id", hoursTarget.closerId);
                  if (error) throw error;
                  toast.success("Horário atualizado!");
                  queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
                  queryClient.invalidateQueries({ queryKey: ["closers"] });
                  queryClient.invalidateQueries({ queryKey: ["closer-hours"] });
                  setHoursTarget(null);
                } catch (err: any) {
                  toast.error(err.message || "Erro ao salvar horário");
                }
                setSavingHours(false);
              }}
            >
              {savingHours ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desconectar conta Google do closer */}
      <AlertDialog open={!!disconnectGoogleTarget} onOpenChange={(open) => { if (!open) setDisconnectGoogleTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a conta Google do closer</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A conexão Google de <strong>{disconnectGoogleTarget?.name}</strong> será removida.
                  Até ele conectar novamente, a agenda dele não será lida e novos eventos não serão
                  criados no Google Calendar.
                </p>
                <p className="text-muted-foreground">
                  Ao atualizar a página do painel, o closer verá o aviso "Sua agenda Google não está
                  conectada" e poderá conectar de novo
                  {disconnectGoogleTarget && !disconnectGoogleTarget.hasMeetScope
                    ? " — é isso que concede a permissão de gravação automática do Meet."
                    : "."}
                </p>
                <p className="text-muted-foreground">
                  Agendamentos, eventos já criados e histórico não são alterados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingDisconnectGoogle}
              onClick={async () => {
                if (!disconnectGoogleTarget) return;
                setSavingDisconnectGoogle(true);
                try {
                  const { error } = await supabase
                    .from("closer_google_tokens")
                    .delete()
                    .eq("closer_id", disconnectGoogleTarget.closerId);
                  if (error) throw error;
                  await logAudit(
                    "google_disconnect",
                    "closer",
                    disconnectGoogleTarget.closerId,
                    { closer_name: disconnectGoogleTarget.name },
                  );

                  toast.success("Conta Google desconectada. O closer poderá reconectar no painel.");
                  queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
                  queryClient.invalidateQueries({ queryKey: ["closer-has-google-token"] });
                  queryClient.invalidateQueries({ queryKey: ["closers"] });
                  setDisconnectGoogleTarget(null);
                } catch (err: any) {
                  toast.error(err.message || "Erro ao desconectar a conta Google");
                }
                setSavingDisconnectGoogle(false);
              }}
            >
              {savingDisconnectGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Piloto: gravação automática do Meet */}

      <AlertDialog open={!!autoRecTarget} onOpenChange={(open) => { if (!open) setAutoRecTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {autoRecTarget?.enable ? "Ativar gravação automática (piloto)" : "Desativar gravação automática"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {autoRecTarget?.enable ? (
                  <>
                    <p>
                      As novas reuniões de <strong>{autoRecTarget?.name}</strong> passarão a ser criadas com
                      gravação (e transcrição, quando o plano permitir) iniciando automaticamente.
                    </p>
                    <p className="text-muted-foreground">
                      Importante: o closer precisa reconectar o Google para conceder a nova permissão.
                      Enquanto isso não acontecer, o sistema continua criando as reuniões do jeito atual —
                      nada deixa de funcionar.
                    </p>
                  </>
                ) : (
                  <p>
                    As novas reuniões de <strong>{autoRecTarget?.name}</strong> voltarão a ser criadas
                    normalmente, sem gravação automática. Reuniões já criadas não são alteradas.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingAutoRec}
              onClick={async () => {
                if (!autoRecTarget) return;
                setSavingAutoRec(true);
                try {
                  const { error } = await supabase.from("closers")
                    .update({ auto_recording_enabled: autoRecTarget.enable } as any)
                    .eq("id", autoRecTarget.closerId);
                  if (error) throw error;
                  toast.success(autoRecTarget.enable ? "Gravação automática ativada!" : "Gravação automática desativada.");
                  queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
                  queryClient.invalidateQueries({ queryKey: ["closers"] });
                  setAutoRecTarget(null);
                } catch (err: any) {
                  toast.error(err.message || "Erro ao salvar");
                }
                setSavingAutoRec(false);
              }}
            >
              {savingAutoRec ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ramal API4COM dialog */}
      <AlertDialog open={!!ramalTarget} onOpenChange={(open) => { if (!open) setRamalTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ramal API4COM</AlertDialogTitle>
            <AlertDialogDescription>
              Ramal usado para iniciar ligações para o lead em nome de <strong>{ramalTarget?.name}</strong>. Deixe em branco para o sistema tentar descobrir automaticamente pelo e-mail cadastrado na API4COM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Input
              placeholder="Ex: 1001"
              value={editRamal}
              onChange={(e) => setEditRamal(e.target.value.trim())}
              className="font-mono text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingRamal}
              onClick={async () => {
                if (!ramalTarget) return;
                setSavingRamal(true);
                try {
                  const { error } = await supabase.from("profiles")
                    .update({ api4com_extension: editRamal || null } as any)
                    .eq("user_id", ramalTarget.userId);
                  if (error) throw error;
                  toast.success("Ramal atualizado!");
                  queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
                  setRamalTarget(null);
                } catch (err: any) {
                  toast.error(err.message || "Erro ao salvar ramal");
                }
                setSavingRamal(false);
              }}
            >
              {savingRamal ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de desativação de usuário */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.name}</strong> perderá o acesso ao sistema imediatamente e, se for Closer,
              as reuniões futuras dele voltam para "Aguardando atribuição". Essa ação fica registrada no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!togglingId}
              onClick={async () => {
                const target = deactivateTarget;
                setDeactivateTarget(null);
                if (target) await handleToggleActive(target, false);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Settings Section ────────────────────────────────────────── */

function SettingsSection() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("key, value");
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => { map[s.key] = s.value; });
      return map;
    },
  });

  const [hoursStart, setHoursStart] = useState("09:00");
  const [hoursEnd, setHoursEnd] = useState("23:00");
  const [meetingDuration, setMeetingDuration] = useState("60");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [stageReuniaoAgendada, setStageReuniaoAgendada] = useState("");
  const [stageNoShowCancelado, setStageNoShowCancelado] = useState("");
  const [stageReuniaoRealizada, setStageReuniaoRealizada] = useState("");
  const [pipelinePreVendas, setPipelinePreVendas] = useState("");
  const [pipelineVendas, setPipelineVendas] = useState("");

  useEffect(() => {
    if (settings) {
      setHoursStart(settings.business_hours_start || "09:00");
      setHoursEnd(settings.business_hours_end || "23:00");
      setMeetingDuration(settings.meeting_duration || "60");
      setWebhookUrl(settings.datacrazy_webhook_url || "");
      setStageReuniaoAgendada(settings.datacrazy_stage_reuniao_agendada || "");
      setStageNoShowCancelado(settings.datacrazy_stage_noshow_cancelado || "");
      setStageReuniaoRealizada(settings.datacrazy_stage_reuniao_realizada || "");
      setPipelinePreVendas(settings.datacrazy_pipeline_pre_vendas || "");
      setPipelineVendas(settings.datacrazy_pipeline_vendas || "");
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: "business_hours_start", value: hoursStart },
        { key: "business_hours_end", value: hoursEnd },
        { key: "meeting_duration", value: meetingDuration },
        { key: "datacrazy_webhook_url", value: webhookUrl },
        { key: "datacrazy_stage_reuniao_agendada", value: stageReuniaoAgendada },
        { key: "datacrazy_stage_noshow_cancelado", value: stageNoShowCancelado },
        { key: "datacrazy_stage_reuniao_realizada", value: stageReuniaoRealizada },
        { key: "datacrazy_pipeline_pre_vendas", value: pipelinePreVendas },
        { key: "datacrazy_pipeline_vendas", value: pipelineVendas },
      ];

      for (const u of updates) {
        // Upsert: try update first, if no rows affected, insert
        const { data: existing } = await supabase
          .from("app_settings")
          .select("id")
          .eq("key", u.key)
          .limit(1)
          .single();

        if (existing) {
          await supabase.from("app_settings")
            .update({ value: u.value, updated_at: new Date().toISOString() })
            .eq("key", u.key);
        } else {
          await supabase.from("app_settings")
            .insert({ key: u.key, value: u.value });
        }
      }

      toast.success("Configurações salvas!");
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["business-hours-settings"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-6">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Settings className="h-4 w-4 text-primary" />
        Configurações Gerais
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Horário comercial — início</label>
          <Input type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Horário comercial — fim</label>
          <Input type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} className="font-mono" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Duração padrão das reuniões</label>
        <div className="flex gap-3">
          {["30", "45", "60"].map((d) => (
            <label key={d} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="meeting_duration"
                value={d}
                checked={meetingDuration === d}
                onChange={() => setMeetingDuration(d)}
                className="accent-[hsl(var(--primary))]"
              />
              <span className="text-sm">{d}min</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">URL do webhook DataCrazy</label>
        <Input
          type="url"
          placeholder="https://..."
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">Editável sem republicar.</p>
      </div>

      <div className="border-t border-primary/10 pt-4 space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">IDs das Etapas DataCrazy</h4>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etapa "Reunião Agendada" (Pré-Vendas)</label>
            <Input placeholder="UUID da etapa" value={stageReuniaoAgendada} onChange={(e) => setStageReuniaoAgendada(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etapa "No-show/Cancelado" (Pré-Vendas)</label>
            <Input placeholder="UUID da etapa" value={stageNoShowCancelado} onChange={(e) => setStageNoShowCancelado(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etapa "Reunião Realizada" (Vendas)</label>
            <Input placeholder="UUID da etapa" value={stageReuniaoRealizada} onChange={(e) => setStageReuniaoRealizada(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ID Pipeline Pré-Vendas</label>
            <Input placeholder="UUID do pipeline" value={pipelinePreVendas} onChange={(e) => setPipelinePreVendas(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ID Pipeline Vendas</label>
            <Input placeholder="UUID do pipeline" value={pipelineVendas} onChange={(e) => setPipelineVendas(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar Configurações
      </Button>
    </div>
  );
}

/* ─── Deletion Reasons Section ──────────────────────────────── */

function DeletionReasonsSection() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [reasons, setReasons] = useState<DeletionReason[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newRestricted, setNewRestricted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["app-settings", "deletion_reasons"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "deletion_reasons")
        .maybeSingle();
      return parseDeletionReasons(data?.value);
    },
  });

  useEffect(() => {
    if (data) setReasons(data);
  }, [data]);

  const persist = async (next: DeletionReason[]) => {
    setSaving(true);
    try {
      const value = JSON.stringify(next);
      const { data: existing } = await supabase
        .from("app_settings")
        .select("id")
        .eq("key", "deletion_reasons")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("app_settings")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("key", "deletion_reasons");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("app_settings")
          .insert({ key: "deletion_reasons", value });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["app-settings", "deletion_reasons"] });
      await logAudit("update_settings", "settings", null as any, { key: "deletion_reasons", count: next.length });
      toast.success("Justificativas atualizadas!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar justificativas");
    }
    setSaving(false);
  };

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    if (reasons.some((r) => r.label.toLowerCase() === label.toLowerCase())) {
      toast.error("Essa justificativa já existe");
      return;
    }
    const next = [...reasons, { label, restricted: newRestricted }];
    setReasons(next);
    setNewLabel("");
    setNewRestricted(false);
    await persist(next);
  };

  const handleRemove = async (idx: number) => {
    const next = reasons.filter((_, i) => i !== idx);
    setReasons(next);
    await persist(next);
  };

  const handleToggleRestricted = async (idx: number) => {
    const next = reasons.map((r, i) => i === idx ? { ...r, restricted: !r.restricted } : r);
    setReasons(next);
    await persist(next);
  };

  const handleEditLabel = async (idx: number, newLabelValue: string) => {
    const trimmed = newLabelValue.trim();
    if (!trimmed) return;
    const next = reasons.map((r, i) => i === idx ? { ...r, label: trimmed } : r);
    setReasons(next);
    await persist(next);
  };

  return (
    <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Justificativas de exclusão
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Opções disponíveis ao excluir uma reunião. Justificativas marcadas como "restrito" só aparecem para administradores e moderadores.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <div className="space-y-2">
          {reasons.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Nenhuma justificativa cadastrada.</p>
          )}
          {reasons.map((r, idx) => (
            <ReasonRow
              key={`${r.label}-${idx}`}
              reason={r}
              disabled={saving}
              onSaveLabel={(label) => handleEditLabel(idx, label)}
              onToggleRestricted={() => handleToggleRestricted(idx)}
              onRemove={() => handleRemove(idx)}
            />
          ))}
        </div>
      )}

      <div className="border-t border-primary/10 pt-4 space-y-2">
        <label className="text-sm font-medium">Adicionar nova justificativa</label>
        <div className="flex gap-2">
          <Input
            placeholder="Ex.: Lead desistiu"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          />
          <Button onClick={handleAdd} disabled={saving || !newLabel.trim()} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={newRestricted} onCheckedChange={(v) => setNewRestricted(!!v)} />
          <span className="text-xs text-muted-foreground">Restrito a admin/moderador</span>
        </label>
      </div>
    </div>
  );
}

function ReasonRow({
  reason,
  disabled,
  onSaveLabel,
  onToggleRestricted,
  onRemove,
}: {
  reason: DeletionReason;
  disabled: boolean;
  onSaveLabel: (label: string) => void;
  onToggleRestricted: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(reason.label);

  useEffect(() => { setValue(reason.label); }, [reason.label]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/10 bg-secondary/30 px-3 py-2">
      {editing ? (
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSaveLabel(value); setEditing(false); }
            if (e.key === "Escape") { setValue(reason.label); setEditing(false); }
          }}
          autoFocus
          className="h-8 text-sm"
        />
      ) : (
        <span className="flex-1 text-sm font-medium">{reason.label}</span>
      )}
      {!editing && reason.restricted && (
        <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-400 border-orange-500/30">
          Restrito
        </Badge>
      )}
      {editing ? (
        <>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onSaveLabel(value); setEditing(false); }}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setValue(reason.label); setEditing(false); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={disabled}
            title={reason.restricted ? "Liberar para todos" : "Restringir a admin/moderador"}
            onClick={onToggleRestricted}
          >
            <ShieldAlert className={cn("h-3.5 w-3.5", reason.restricted && "text-orange-400")} />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled} onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" disabled={disabled} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { isGestor, isModerador, role } = useAuth();
  const canManageReasons = isGestor || isModerador;

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 w-full max-w-3xl xl:max-w-none mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">Gerencie usuários e configurações.</p>
        </div>

        {isGestor ? (
          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-7 bg-secondary">
              <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm">
                <Users className="h-3.5 w-3.5" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="permissions" className="gap-1.5 text-xs sm:text-sm">
                <ShieldCheck className="h-3.5 w-3.5" />
                Permissões
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
                <Settings className="h-3.5 w-3.5" />
                Sistema
              </TabsTrigger>
              <TabsTrigger value="lists" className="gap-1.5 text-xs sm:text-sm">
                <Plus className="h-3.5 w-3.5" />
                Listas
              </TabsTrigger>
              <TabsTrigger value="gravacao" className="gap-1.5 text-xs sm:text-sm">
                <Video className="h-3.5 w-3.5" />
                Gravação
              </TabsTrigger>
              <TabsTrigger value="crm-lote" className="gap-1.5 text-xs sm:text-sm">
                <Send className="h-3.5 w-3.5" />
                Envio em lote
              </TabsTrigger>
              <TabsTrigger value="bloqueios" className="gap-1.5 text-xs sm:text-sm">
                <CalendarX className="h-3.5 w-3.5" />
                Bloqueios
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <UsersSection />
            </TabsContent>
            <TabsContent value="permissions">
              <PermissionsMatrix />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsSection />
            </TabsContent>
            <TabsContent value="lists">
              <DynamicListsSection />
            </TabsContent>
            <TabsContent value="gravacao">
              <MeetRolloutPanel />
            </TabsContent>
            <TabsContent value="crm-lote">
              <CrmBulkVendasPanel />
            </TabsContent>
            <TabsContent value="bloqueios">
              <BloqueiosSection />
            </TabsContent>
          </Tabs>
        ) : isModerador ? (
          <Tabs defaultValue="lists" className="space-y-4">
            <TabsList className={cn("grid w-full bg-secondary", role === "moderador" ? "grid-cols-2" : "grid-cols-1")}>
              <TabsTrigger value="lists" className="gap-1.5 text-xs sm:text-sm">
                <Plus className="h-3.5 w-3.5" />
                Listas
              </TabsTrigger>
              {role === "moderador" && (
                <TabsTrigger value="bloqueios" className="gap-1.5 text-xs sm:text-sm">
                  <CalendarX className="h-3.5 w-3.5" />
                  Bloqueios
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="lists">
              <DynamicListsSection />
            </TabsContent>
            {role === "moderador" && (
              <TabsContent value="bloqueios">
                <BloqueiosSection />
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <UsersSection />
        )}
      </div>
    </AppLayout>
  );
}
