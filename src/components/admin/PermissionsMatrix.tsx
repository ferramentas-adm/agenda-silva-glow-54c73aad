import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Save, ShieldCheck, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  ALL_ROLES, PERMISSION_LABELS, type PermissionKey, type AppRole,
} from "@/hooks/usePermissions";
import { logAudit } from "@/services/auditLog";

interface MatrixRow {
  role: AppRole;
  permission_key: PermissionKey;
  allowed: boolean;
}

const ROLE_LABELS: Record<AppRole, string> = {
  gestor: "Gestor",
  moderador: "Moderador",
  supervisor: "Supervisor",
  closer: "Closer",
  sdr: "SDR",
};

export default function PermissionsMatrix() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["role-permissions-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, permission_key, allowed");
      if (error) throw error;
      return (data ?? []) as unknown as MatrixRow[];
    },
  });

  const matrix = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const r of rows) map.set(`${r.role}:${r.permission_key}`, r.allowed);
    return map;
  }, [rows]);

  const getValue = (role: AppRole, key: PermissionKey): boolean => {
    const k = `${role}:${key}`;
    if (k in pending) return pending[k];
    return matrix.get(k) ?? false;
  };

  const toggle = (role: AppRole, key: PermissionKey, value: boolean) => {
    const k = `${role}:${key}`;
    const original = matrix.get(k) ?? false;
    setPending((p) => {
      const next = { ...p };
      if (value === original) delete next[k];
      else next[k] = value;
      return next;
    });
  };

  const dirtyCount = Object.keys(pending).length;

  const handleSave = async () => {
    if (!user || dirtyCount === 0) return;
    setSaving(true);
    try {
      const updates = Object.entries(pending).map(([k, allowed]) => {
        const [role, permission_key] = k.split(":") as [AppRole, PermissionKey];
        return { role, permission_key, allowed, updated_by: user.id, updated_at: new Date().toISOString() };
      });

      const { error } = await supabase
        .from("role_permissions")
        .upsert(updates, { onConflict: "role,permission_key" });

      if (error) throw error;

      await logAudit("role_permissions_updated", "role_permissions", null, {
        changes: updates.map((u) => ({ role: u.role, permission_key: u.permission_key, allowed: u.allowed })),
      });

      toast.success(`${dirtyCount} permissão(ões) atualizada(s).`);
      setPending({});
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["role-permissions-admin"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar permissões.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const permissionKeys = Object.keys(PERMISSION_LABELS) as PermissionKey[];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Matriz de Permissões
              </CardTitle>
              <CardDescription>
                Controle quais funcionalidades cada função pode acessar no sistema.
              </CardDescription>
            </div>
            <Button onClick={handleSave} disabled={dirtyCount === 0 || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Salvar {dirtyCount > 0 && <Badge variant="secondary" className="ml-2">{dirtyCount}</Badge>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Esta matriz controla a visibilidade de menus e ações na interface. As regras de segurança
              do banco de dados (RLS) continuam ativas como camada final de proteção, garantindo que
              cada usuário só acesse os dados permitidos para sua função.
            </AlertDescription>
          </Alert>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Funcionalidade</TableHead>
                    {ALL_ROLES.map((r) => (
                      <TableHead key={r} className="text-center">{ROLE_LABELS[r]}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionKeys.map((key) => {
                    const meta = PERMISSION_LABELS[key];
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <div className="font-medium text-sm">{meta.label}</div>
                          <div className="text-xs text-muted-foreground">{meta.description}</div>
                        </TableCell>
                        {ALL_ROLES.map((role) => {
                          const k = `${role}:${key}`;
                          const isDirty = k in pending;
                          return (
                            <TableCell key={role} className="text-center">
                              <div className="flex justify-center">
                                <Switch
                                  checked={getValue(role, key)}
                                  onCheckedChange={(v) => toggle(role, key, v)}
                                  disabled={role === "gestor"}
                                  className={isDirty ? "ring-2 ring-primary ring-offset-2" : ""}
                                />
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">
                ℹ️ A função <strong>Gestor</strong> sempre tem acesso total — não pode ser bloqueada.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
