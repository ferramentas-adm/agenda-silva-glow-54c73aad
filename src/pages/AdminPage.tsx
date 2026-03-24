import { useState, useEffect } from "react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Users, AlertCircle,
  Loader2, Pencil, Trash2, Settings, Save, X, Check, KeyRound, Eye, EyeOff, ArrowRightLeft, Copy, RefreshCw, Clock,
} from "lucide-react";

/* ─── Users Section (unified SDR + Closer management) ─────────── */

function UsersSection() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"sdr" | "gestor" | "closer">("sdr");
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

  // Password change state
  const [passwordChangeTarget, setPasswordChangeTarget] = useState<{ userId: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Role change state
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ userId: string; name: string; currentRole: string } | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [changingRole, setChangingRole] = useState(false);

  // Closer hours edit state
  const [hoursTarget, setHoursTarget] = useState<{ closerId: string; name: string; ranges: { start: string; end: string }[] } | null>(null);
  const [editRanges, setEditRanges] = useState<{ start: string; end: string }[]>([{ start: "09:00", end: "23:00" }]);
  const [savingHours, setSavingHours] = useState(false);

  // Fetch all users (profiles + roles) and closers
  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: roles } = await supabase.from("user_roles").select("*");
      const { data: closers } = await supabase.from("closers").select("*").order("name");

      // Build a map of closer info by email
      const closerMap = new Map<string, { closerId: string; hoursStart: string; hoursEnd: string; ranges: { start: string; end: string }[] }>();
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
        };
      });

      // Only show closers without auth accounts (legacy closers)
      const closerUsers = (closers ?? [])
        .filter((c: any) => !c.email || !profileEmails.has(c.email.toLowerCase()))
        .map((c: any) => ({
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
        }));

      return [...profileUsers, ...closerUsers];
    },
  });

  const validatePassword = (pw: string): string[] => {
    const errs: string[] = [];
    if (pw.length < 8) errs.push("Mínimo 8 caracteres");
    if (!/[A-Z]/.test(pw)) errs.push("Pelo menos 1 letra maiúscula");
    if (!/[0-9]/.test(pw)) errs.push("Pelo menos 1 número");
    return errs;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setGeneratedPassword(null);
    try {
      // All users (including closers) now go through create-user edge function
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, full_name: fullName, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      setGeneratedPassword(data.generated_password);
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
        const { error } = await supabase.from("profiles")
          .update({ full_name: editName, email: editEmail })
          .eq("user_id", user.userId);
        if (error) throw error;
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
      } else {
        const { data, error } = await supabase.functions.invoke("manage-user", {
          body: { user_id: deleteTarget.userId, action: "delete" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }
      toast.success("Usuário excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleToggleActive = async (user: any) => {
    setTogglingId(user.userId);
    try {
      if (user.type === "closer") {
        const { error } = await supabase.from("closers")
          .update({ active: !user.active })
          .eq("id", user.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ["closers"] });
        queryClient.invalidateQueries({ queryKey: ["closers-active"] });
      } else {
        const { data, error } = await supabase.functions.invoke("manage-user", {
          body: { user_id: user.userId, action: "toggle_active" },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }
      toast.success(!user.active ? "Usuário ativado" : "Usuário desativado");
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
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { user_id: passwordChangeTarget.userId, action: "change_password", new_password: newPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Senha alterada com sucesso!");
      setPasswordChangeTarget(null);
      setNewPassword("");
      setShowNewPassword(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    }
    setChangingPassword(false);
  };

  const handleChangeRole = async () => {
    if (!roleChangeTarget || !newRole) return;
    setChangingRole(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { user_id: roleChangeTarget.userId, action: "change_role", new_role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Função alterada para ${roleLabel(newRole)}`);
      setRoleChangeTarget(null);
      setNewRole("");
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar função");
    }
    setChangingRole(false);
  };

  const roleLabel = (r: string) => {
    switch (r) {
      case "gestor": return "Admin";
      case "sdr": return "SDR";
      case "closer": return "Closer";
      default: return r;
    }
  };

  return (
    <div className="space-y-6">
      {/* Create user form */}
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
                <SelectItem value="gestor">Administrador</SelectItem>
                <SelectItem value="closer">Closer</SelectItem>
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

      {/* Users list */}
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Usuários ({allUsers.length})
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {allUsers.map((u: any) => {
              const isEditing = editingId === u.userId;
              return (
                <div key={`${u.type}-${u.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-4 py-3">
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input className="h-8 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Input className="h-8 text-sm" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="E-mail" />
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.name}</p>
                      <div className="flex items-center gap-2">
                        {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                        {u.role === "closer" && u.closerId && (
                          <span className="text-xs text-muted-foreground">({u.hoursStart}–{u.hoursEnd})</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
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
                        </span>
                        <Switch
                          checked={u.active}
                          onCheckedChange={() => handleToggleActive(u)}
                          disabled={togglingId === u.userId}
                        />
                        {u.type === "profile" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Alterar função"
                            onClick={() => { setRoleChangeTarget({ userId: u.userId, name: u.name, currentRole: u.role }); setNewRole(u.role === "sdr" ? "gestor" : "sdr"); }}>
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {u.role === "closer" && u.closerId && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Horário de trabalho"
                            onClick={() => { setHoursTarget({ closerId: u.closerId!, name: u.name, start: u.hoursStart, end: u.hoursEnd }); setEditHoursStart(u.hoursStart); setEditHoursEnd(u.hoursEnd); }}>
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Alterar senha"
                          onClick={() => { setPasswordChangeTarget({ userId: u.userId, name: u.name }); setNewPassword(""); setShowNewPassword(false); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(u.userId); setEditName(u.name); setEditEmail(u.email); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ userId: u.userId, name: u.name, type: u.type })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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

      {/* Role change dialog */}
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
                <SelectItem value="gestor">Administrador</SelectItem>
                <SelectItem value="closer">Closer</SelectItem>
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
              Configure o horário de trabalho de <strong>{hoursTarget?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 sm:grid-cols-2 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Início</label>
              <Input type="time" value={editHoursStart} onChange={(e) => setEditHoursStart(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fim</label>
              <Input type="time" value={editHoursEnd} onChange={(e) => setEditHoursEnd(e.target.value)} className="font-mono" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingHours}
              onClick={async () => {
                if (!hoursTarget) return;
                setSavingHours(true);
                try {
                  const { error } = await supabase.from("closers")
                    .update({ business_hours_start: editHoursStart, business_hours_end: editHoursEnd })
                    .eq("id", hoursTarget.closerId);
                  if (error) throw error;
                  toast.success("Horário atualizado!");
                  queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
                  queryClient.invalidateQueries({ queryKey: ["closers"] });
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
      const { data } = await supabase.from("app_settings").select("*");
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

/* ─── Main Admin Page ─────────────────────────────────────────── */

export default function AdminPage() {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">Gerencie usuários e configurações.</p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 bg-secondary">
            <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersSection />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsSection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
