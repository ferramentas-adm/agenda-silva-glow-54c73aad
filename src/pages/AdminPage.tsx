import { useState } from "react";
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
  UserPlus, Users, Briefcase, AlertCircle, CalendarCheck, ExternalLink,
  Loader2, Pencil, Trash2, Settings, RefreshCw, Save, X, Check,
} from "lucide-react";

/* ─── SDR Management ──────────────────────────────────────────── */

function SdrSection() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"sdr" | "gestor">("sdr");
  const [creating, setCreating] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ userId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle active
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: roles } = await supabase.from("user_roles").select("*");
      return (profiles ?? []).map((p: any) => ({
        ...p,
        role: roles?.find((r: any) => r.user_id === p.user_id)?.role ?? "sdr",
      }));
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
    const errs = validatePassword(password);
    if (errs.length > 0) { setPasswordErrors(errs); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, full_name: fullName, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Usuário criado com sucesso!");
      setFullName(""); setEmail(""); setPassword(""); setPasswordErrors([]);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    }
    setCreating(false);
  };

  const handleSaveEdit = async (userId: string) => {
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("profiles")
        .update({ full_name: editName, email: editEmail })
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Usuário atualizado!");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    }
    setSavingEdit(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { user_id: deleteTarget.userId, action: "delete" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Usuário excluído!");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleToggleActive = async (userId: string) => {
    setTogglingId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: { user_id: userId, action: "toggle_active" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data.active ? "Usuário ativado" : "Usuário desativado");
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status");
    }
    setTogglingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Create user form */}
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <UserPlus className="h-4 w-4 text-primary" />
          Criar Usuário
        </h3>
        <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="space-y-1.5">
            <Input
              type="password" placeholder="Senha" value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordErrors(e.target.value ? validatePassword(e.target.value) : []); }}
              required minLength={8}
            />
            {passwordErrors.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {passwordErrors.map((err) => (
                  <p key={err} className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />{err}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant={role === "sdr" ? "default" : "secondary"} size="sm" onClick={() => setRole("sdr")} className="flex-1">SDR</Button>
            <Button type="button" variant={role === "gestor" ? "default" : "secondary"} size="sm" onClick={() => setRole("gestor")} className="flex-1">Gestor</Button>
          </div>
          <Button type="submit" disabled={creating} className="sm:col-span-2">
            {creating ? <Loader2 className="animate-spin" /> : "Criar Usuário"}
          </Button>
        </form>
      </div>

      {/* Users list */}
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Usuários ({users?.length ?? 0})
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {users?.map((u: any) => {
              const isEditing = editingId === u.user_id;
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-4 py-3">
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input className="h-8 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Input className="h-8 text-sm" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(u.user_id)} disabled={savingEdit}>
                          {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-primary" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold uppercase text-primary">
                          {u.role}
                        </span>
                        <Switch
                          checked={u.active !== false}
                          onCheckedChange={() => handleToggleActive(u.user_id)}
                          disabled={togglingId === u.user_id}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(u.user_id); setEditName(u.full_name); setEditEmail(u.email); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ userId: u.user_id, name: u.full_name })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {(!users || users.length === 0) && (
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
    </div>
  );
}

/* ─── Closer Management ───────────────────────────────────────── */

function CloserSection() {
  const queryClient = useQueryClient();
  const { getAuthUrl } = useGoogleAuthUrl();

  const [closerName, setCloserName] = useState("");
  const [closerEmail, setCloserEmail] = useState("");
  const [addingCloser, setAddingCloser] = useState(false);
  const [connectingCloserId, setConnectingCloserId] = useState<string | null>(null);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; hasFuture: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: closers, isLoading } = useQuery({
    queryKey: ["closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: connectedCloserIds = [] } = useQuery({
    queryKey: ["closer-google-tokens"],
    queryFn: async () => {
      const { data } = await supabase.from("closer_google_tokens" as any).select("closer_id");
      return (data ?? []).map((d: any) => d.closer_id);
    },
  });

  const handleAddCloser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingCloser(true);
    try {
      const { error } = await supabase.from("closers").insert({ name: closerName, email: closerEmail || null });
      if (error) throw error;
      toast.success("Closer adicionado!");
      setCloserName(""); setCloserEmail("");
      queryClient.invalidateQueries({ queryKey: ["closers"] });
    } catch (err: any) { toast.error(err.message || "Erro ao adicionar closer"); }
    setAddingCloser(false);
  };

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("closers").update({ name: editName, email: editEmail || null }).eq("id", id);
      if (error) throw error;
      toast.success("Closer atualizado!");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["closers"] });
    } catch (err: any) { toast.error(err.message || "Erro ao atualizar"); }
    setSavingEdit(false);
  };

  const handleDeleteCloser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("closers").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Closer excluído!");
      queryClient.invalidateQueries({ queryKey: ["closers"] });
    } catch (err: any) { toast.error(err.message || "Erro ao excluir"); }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    try {
      const { error } = await supabase.from("closers").update({ active: !currentActive }).eq("id", id);
      if (error) throw error;
      toast.success(!currentActive ? "Closer ativado" : "Closer desativado");
      queryClient.invalidateQueries({ queryKey: ["closers"] });
      queryClient.invalidateQueries({ queryKey: ["closers-active"] });
    } catch (err: any) { toast.error(err.message || "Erro ao alterar status"); }
    setTogglingId(null);
  };

  const handleConnectGoogle = async (closerId: string) => {
    setConnectingCloserId(closerId);
    try {
      const url = await getAuthUrl(closerId);
      window.open(url, "_blank", "width=600,height=700");
    } catch (err: any) { toast.error(err.message || "Erro ao gerar link de autorização"); }
    setConnectingCloserId(null);
  };

  const checkFutureMeetings = async (closerId: string) => {
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("agendamentos")
      .select("id", { count: "exact", head: true })
      .eq("closer_id", closerId)
      .gte("scheduled_date", today)
      .in("status", ["pendente", "confirmada"]);
    return (count ?? 0) > 0;
  };

  return (
    <div className="space-y-6">
      {/* Add closer form */}
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Briefcase className="h-4 w-4 text-primary" />
          Adicionar Closer
        </h3>
        <form onSubmit={handleAddCloser} className="flex flex-col gap-3 sm:flex-row">
          <Input placeholder="Nome do closer" value={closerName} onChange={(e) => setCloserName(e.target.value)} required className="flex-1" />
          <Input type="email" placeholder="E-mail Google (opcional)" value={closerEmail} onChange={(e) => setCloserEmail(e.target.value)} className="flex-1" />
          <Button type="submit" disabled={addingCloser} size="sm" className="gap-2">
            {addingCloser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
          </Button>
        </form>
      </div>

      {/* Closers list */}
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Briefcase className="h-4 w-4 text-primary" />
          Closers ({closers?.length ?? 0})
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {closers?.map((c: any) => {
              const isGoogleConnected = connectedCloserIds.includes(c.id);
              const isEditing = editingId === c.id;

              return (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-4 py-3">
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input className="h-8 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Input className="h-8 text-sm" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="E-mail Google" />
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                    </div>
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveEdit(c.id)} disabled={savingEdit}>
                          {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-primary" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {isGoogleConnected ? (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary" onClick={() => handleConnectGoogle(c.id)} disabled={connectingCloserId === c.id}>
                            <CalendarCheck className="h-3 w-3" />
                            {connectingCloserId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Reconectar
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleConnectGoogle(c.id)} disabled={connectingCloserId === c.id} className="h-7 gap-1 text-xs">
                            {connectingCloserId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                            Conectar Google
                          </Button>
                        )}
                        <Switch
                          checked={c.active}
                          onCheckedChange={() => handleToggleActive(c.id, c.active)}
                          disabled={togglingId === c.id}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(c.id); setEditName(c.name); setEditEmail(c.email || ""); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={async () => {
                            const hasFuture = await checkFutureMeetings(c.id);
                            setDeleteTarget({ id: c.id, name: c.name, hasFuture });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {(!closers || closers.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum closer cadastrado.</p>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir closer</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.hasFuture ? (
                <>
                  <strong className="text-destructive">⚠️ Atenção:</strong> {deleteTarget.name} possui reuniões futuras pendentes/confirmadas.
                  Excluir o closer removerá o vínculo com essas reuniões. Considere desativá-lo ao invés de excluir.
                </>
              ) : (
                <>Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCloser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir mesmo assim"}
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

  const [hoursStart, setHoursStart] = useState("");
  const [hoursEnd, setHoursEnd] = useState("");
  const [meetingDuration, setMeetingDuration] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  // Sync from loaded settings
  useState(() => {
    if (settings) {
      setHoursStart(settings.business_hours_start || "09:00");
      setHoursEnd(settings.business_hours_end || "23:00");
      setMeetingDuration(settings.meeting_duration || "60");
      setWebhookUrl(settings.datacrazy_webhook_url || "");
    }
  });

  // Update local state when settings load
  const loaded = settings && hoursStart === "" && hoursEnd === "";
  if (loaded) {
    // Will trigger re-render with correct values
    setTimeout(() => {
      setHoursStart(settings.business_hours_start || "09:00");
      setHoursEnd(settings.business_hours_end || "23:00");
      setMeetingDuration(settings.meeting_duration || "60");
      setWebhookUrl(settings.datacrazy_webhook_url || "");
    }, 0);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: "business_hours_start", value: hoursStart },
        { key: "business_hours_end", value: hoursEnd },
        { key: "meeting_duration", value: meetingDuration },
        { key: "datacrazy_webhook_url", value: webhookUrl },
      ];

      for (const u of updates) {
        await supabase.from("app_settings").update({ value: u.value, updated_at: new Date().toISOString() }).eq("key", u.key);
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
        <Select value={meetingDuration} onValueChange={setMeetingDuration}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 minutos</SelectItem>
            <SelectItem value="45">45 minutos</SelectItem>
            <SelectItem value="60">60 minutos</SelectItem>
          </SelectContent>
        </Select>
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
        <p className="text-xs text-muted-foreground">Editável sem republicar. Eventos são enviados para esta URL.</p>
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
          <p className="text-sm text-muted-foreground">Gerencie usuários, closers e configurações.</p>
        </div>

        <Tabs defaultValue="sdrs" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-secondary">
            <TabsTrigger value="sdrs" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" />
              SDRs
            </TabsTrigger>
            <TabsTrigger value="closers" className="gap-1.5 text-xs sm:text-sm">
              <Briefcase className="h-3.5 w-3.5" />
              Closers
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sdrs">
            <SdrSection />
          </TabsContent>
          <TabsContent value="closers">
            <CloserSection />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsSection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
