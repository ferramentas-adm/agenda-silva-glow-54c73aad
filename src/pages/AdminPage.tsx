import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, UserPlus, Users, Briefcase, AlertCircle, CalendarCheck, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useGoogleAuthUrl } from "@/hooks/useGoogleCalendar";

export default function AdminPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"sdr" | "gestor">("sdr");
  const [creating, setCreating] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  // Closers management
  const [closerName, setCloserName] = useState("");
  const [closerEmail, setCloserEmail] = useState("");
  const [addingCloser, setAddingCloser] = useState(false);

  const { getAuthUrl } = useGoogleAuthUrl();
  const [connectingCloserId, setConnectingCloserId] = useState<string | null>(null);

  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: roles } = await supabase.from("user_roles").select("*");
      return (profiles ?? []).map((p) => ({
        ...p,
        role: roles?.find((r) => r.user_id === p.user_id)?.role ?? "sdr",
      }));
    },
  });

  const { data: closers, refetch: refetchClosers } = useQuery({
    queryKey: ["closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("*").order("name");
      return data ?? [];
    },
  });

  // Check which closers have Google Calendar connected
  const { data: connectedCloserIds = [] } = useQuery({
    queryKey: ["closer-google-tokens"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closer_google_tokens" as any)
        .select("closer_id");
      return (data ?? []).map((d: any) => d.closer_id);
    },
  });

  const validatePassword = (pw: string): string[] => {
    const errs: string[] = [];
    if (pw.length < 8) errs.push("Mínimo 8 caracteres");
    if (!/[A-Z]/.test(pw)) errs.push("Pelo menos 1 letra maiúscula");
    if (!/[0-9]/.test(pw)) errs.push("Pelo menos 1 número");
    return errs;
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
    setPasswordErrors(val ? validatePassword(val) : []);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validatePassword(password);
    if (errs.length > 0) {
      setPasswordErrors(errs);
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email, password, full_name: fullName, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Usuário criado com sucesso!");
      setFullName("");
      setEmail("");
      setPassword("");
      setPasswordErrors([]);
      refetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar usuário");
    }
    setCreating(false);
  };

  const handleAddCloser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingCloser(true);
    try {
      const { error } = await supabase.from("closers").insert({
        name: closerName,
        email: closerEmail || null,
      });
      if (error) throw error;
      toast.success("Closer adicionado!");
      setCloserName("");
      setCloserEmail("");
      refetchClosers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar closer");
    }
    setAddingCloser(false);
  };

  const handleConnectGoogle = async (closerId: string) => {
    setConnectingCloserId(closerId);
    try {
      const url = await getAuthUrl(closerId);
      window.open(url, "_blank", "width=600,height=700");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar link de autorização");
    }
    setConnectingCloserId(null);
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">Gerencie usuários e closers.</p>
        </div>

        {/* Create user */}
        <section className="card-meeting p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <UserPlus className="h-5 w-5 text-primary" />
            Criar Usuário
          </h2>
          <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <Input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="space-y-1.5">
              <Input type="password" placeholder="Senha" value={password} onChange={(e) => handlePasswordChange(e.target.value)} required minLength={8} />
              {passwordErrors.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {passwordErrors.map((err) => (
                    <p key={err} className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={role === "sdr" ? "default" : "secondary"}
                size="sm"
                onClick={() => setRole("sdr")}
                className="flex-1"
              >
                SDR
              </Button>
              <Button
                type="button"
                variant={role === "gestor" ? "default" : "secondary"}
                size="sm"
                onClick={() => setRole("gestor")}
                className="flex-1"
              >
                Gestor
              </Button>
            </div>
            <Button type="submit" disabled={creating} className="sm:col-span-2">
              {creating ? <Loader2 className="animate-spin" /> : "Criar Usuário"}
            </Button>
          </form>
        </section>

        {/* Users list */}
        <section className="card-meeting p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-primary" />
            Usuários ({users?.length ?? 0})
          </h2>
          <div className="space-y-2">
            {users?.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-md bg-secondary/50 px-4 py-3">
                <div>
                  <p className="font-medium">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase text-primary">
                  {u.role}
                </span>
              </div>
            ))}
            {(!users || users.length === 0) && (
              <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
            )}
          </div>
        </section>

        {/* Closers management */}
        <section className="card-meeting p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Briefcase className="h-5 w-5 text-primary" />
            Closers ({closers?.length ?? 0})
          </h2>
          <form onSubmit={handleAddCloser} className="flex gap-2">
            <Input placeholder="Nome do closer" value={closerName} onChange={(e) => setCloserName(e.target.value)} required className="flex-1" />
            <Input type="email" placeholder="E-mail (opcional)" value={closerEmail} onChange={(e) => setCloserEmail(e.target.value)} className="flex-1" />
            <Button type="submit" disabled={addingCloser} size="sm">
              {addingCloser ? <Loader2 className="animate-spin" /> : "Adicionar"}
            </Button>
          </form>
          <div className="space-y-2">
            {closers?.map((c) => {
              const isGoogleConnected = connectedCloserIds.includes(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between rounded-md bg-secondary/50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isGoogleConnected ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
                        <CalendarCheck className="h-3 w-3" />
                        Calendar
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleConnectGoogle(c.id)}
                        disabled={connectingCloserId === c.id}
                        className="h-7 gap-1 text-xs"
                      >
                        {connectingCloserId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3 w-3" />
                        )}
                        Conectar Google
                      </Button>
                    )}
                    <span className={`text-xs ${c.active ? "text-primary" : "text-muted-foreground"}`}>
                      {c.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              );
            })}
            {(!closers || closers.length === 0) && (
              <p className="text-sm text-muted-foreground">Nenhum closer cadastrado.</p>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
