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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  UserPlus, Users, AlertCircle,
  Loader2, Pencil, Trash2, Settings, Save, X, Check, KeyRound, Eye, EyeOff, ArrowRightLeft, Copy, RefreshCw, Clock, Link2, Search, CalendarPlus, Plus, ShieldAlert,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { parseDeletionReasons, type DeletionReason } from "@/hooks/useDeletionReasons";

/* ─── Users Section (unified SDR + Closer management) ─────────── */

function UsersSection() {
  const { isGestor } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"sdr" | "gestor" | "closer" | "moderador">("sdr");
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

  // DataCrazy ID edit state
  const [datacrazyTarget, setDatacrazyTarget] = useState<{ userId: string; name: string; type: string; currentId: string; closerId?: string } | null>(null);
  const [editDatacrazyId, setEditDatacrazyId] = useState("");
  const [savingDatacrazyId, setSavingDatacrazyId] = useState(false);

  // Scheduling toggle
  const [togglingSchedulingId, setTogglingSchedulingId] = useState<string | null>(null);

  // Fetch all users (profiles + roles) and closers
  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: roles } = await supabase.from("user_roles").select("*");
      const { data: closers } = await supabase.from("closers").select("*").order("name");

      // Build a map of closer info by email
      const closerMap = new Map<string, { closerId: string; hoursStart: string; hoursEnd: string; ranges: { start: string; end: string }[]; datacrazyId: string }>();
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
            datacrazyId: c.datacrazy_id || "",
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
          datacrazyId: closerInfo?.datacrazyId || (p as any).datacrazy_id || "",
          availableForScheduling: p.available_for_scheduling ?? false,
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
            datacrazyId: c.datacrazy_id || "",
          };
        });

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
        await invokeEdgeFunction("manage-user", { user_id: deleteTarget.userId, action: "delete" });
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
        // Legacy closer without auth account
        const { error } = await supabase.from("closers")
          .update({ active: !user.active })
          .eq("id", user.id);
        if (error) throw error;
      } else {
        // Profile-based user: toggle profile active
        await invokeEdgeFunction("manage-user", { user_id: user.userId, action: "toggle_active" });

        // If this user is a closer with a linked closer record, also toggle it
        if (user.role === "closer" && user.closerId) {
          await supabase.from("closers")
            .update({ active: !user.active })
            .eq("id", user.closerId);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["closers"] });
      queryClient.invalidateQueries({ queryKey: ["closers-active"] });
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
      await invokeEdgeFunction("manage-user", { user_id: passwordChangeTarget.userId, action: "change_password", new_password: newPassword });
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

  const handleChangeRole = async () => {
    if (!roleChangeTarget || !newRole) return;
    setChangingRole(true);
    try {
      await invokeEdgeFunction("manage-user", { user_id: roleChangeTarget.userId, action: "change_role", new_role: newRole });
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

  const roleLabel = (r: string) => {
    switch (r) {
      case "gestor": return "Admin";
      case "sdr": return "SDR";
      case "closer": return "Closer";
      case "moderador": return "Moderador";
      default: return r;
    }
  };

  return (
    <div className="space-y-6">
      {/* Create user form — gestor only */}
      {isGestor && (
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
                <SelectItem value="moderador">Moderador</SelectItem>
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
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-primary" />
            Usuários ({allUsers.length})
          </h3>
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
            </SelectContent>
          </Select>
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
            {allUsers
              .filter((u: any) => {
                if (filterRole !== "all" && u.role !== filterRole) return false;
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
              })
              .map((u: any) => {
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
                          <span className="text-xs text-muted-foreground">
                            ({u.ranges.map((r: any) => `${r.start}–${r.end}`).join(", ")})
                          </span>
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
                        {isGestor && u.type === "profile" && u.role !== "closer" && (
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
                        {isGestor && (
                          <Switch
                            checked={u.active}
                            onCheckedChange={() => handleToggleActive(u)}
                            disabled={togglingId === u.userId}
                          />
                        )}
                        {isGestor && u.type === "profile" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Alterar função"
                            onClick={() => { setRoleChangeTarget({ userId: u.userId, name: u.name, currentRole: u.role }); setNewRole(u.role === "sdr" ? "gestor" : "sdr"); }}>
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {u.role === "closer" && u.closerId && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Horário de trabalho"
                            onClick={() => { setHoursTarget({ closerId: u.closerId!, name: u.name, ranges: u.ranges }); setEditRanges([...u.ranges]); }}>
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isGestor && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={`ID DataCrazy${u.datacrazyId ? ': ' + u.datacrazyId.slice(0, 8) + '...' : ' (não configurado)'}`}
                              onClick={() => { setDatacrazyTarget({ userId: u.userId, name: u.name, type: u.type, currentId: u.datacrazyId || "", closerId: u.closerId }); setEditDatacrazyId(u.datacrazyId || ""); }}>
                              <Link2 className={`h-3.5 w-3.5 ${u.datacrazyId ? 'text-primary' : 'text-muted-foreground'}`} />
                            </Button>
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
                <SelectItem value="moderador">Moderador</SelectItem>
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

      {/* DataCrazy ID dialog */}
      <AlertDialog open={!!datacrazyTarget} onOpenChange={(open) => { if (!open) setDatacrazyTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ID DataCrazy</AlertDialogTitle>
            <AlertDialogDescription>
              Configure o ID do DataCrazy para <strong>{datacrazyTarget?.name}</strong>. Este ID é usado para criar atividades e vincular ações no CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Input
              placeholder="Ex: fca47567-94b8-418f-b087-e6c4d10e71bb"
              value={editDatacrazyId}
              onChange={(e) => setEditDatacrazyId(e.target.value.trim())}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Encontre este ID na plataforma DataCrazy, na página do usuário.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingDatacrazyId}
              onClick={async () => {
                if (!datacrazyTarget) return;
                setSavingDatacrazyId(true);
                try {
                  if (datacrazyTarget.type === "closer" || datacrazyTarget.closerId) {
                    const closerId = datacrazyTarget.closerId || datacrazyTarget.userId;
                    const { error } = await supabase.from("closers")
                      .update({ datacrazy_id: editDatacrazyId || null } as any)
                      .eq("id", closerId);
                    if (error) throw error;
                  }
                  if (datacrazyTarget.type === "profile") {
                    const { error } = await supabase.from("profiles")
                      .update({ datacrazy_id: editDatacrazyId || null } as any)
                      .eq("user_id", datacrazyTarget.userId);
                    if (error) throw error;
                  }
                  toast.success("ID DataCrazy atualizado!");
                  queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
                  setDatacrazyTarget(null);
                } catch (err: any) {
                  toast.error(err.message || "Erro ao salvar");
                }
                setSavingDatacrazyId(false);
              }}
            >
              {savingDatacrazyId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
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
  const { isGestor, isModerador } = useAuth();
  const canManageReasons = isGestor || isModerador;

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">Gerencie usuários e configurações.</p>
        </div>

        {isGestor ? (
          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 bg-secondary">
              <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm">
                <Users className="h-3.5 w-3.5" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
                <Settings className="h-3.5 w-3.5" />
                Configurações
              </TabsTrigger>
              <TabsTrigger value="reasons" className="gap-1.5 text-xs sm:text-sm">
                <ShieldAlert className="h-3.5 w-3.5" />
                Justificativas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <UsersSection />
            </TabsContent>
            <TabsContent value="settings">
              <SettingsSection />
            </TabsContent>
            <TabsContent value="reasons">
              <DeletionReasonsSection />
            </TabsContent>
          </Tabs>
        ) : isModerador ? (
          <Tabs defaultValue="users" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 bg-secondary">
              <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm">
                <Users className="h-3.5 w-3.5" />
                Usuários
              </TabsTrigger>
              <TabsTrigger value="reasons" className="gap-1.5 text-xs sm:text-sm">
                <ShieldAlert className="h-3.5 w-3.5" />
                Justificativas
              </TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <UsersSection />
            </TabsContent>
            <TabsContent value="reasons">
              <DeletionReasonsSection />
            </TabsContent>
          </Tabs>
        ) : (
          <UsersSection />
        )}
      </div>
    </AppLayout>
  );
}
