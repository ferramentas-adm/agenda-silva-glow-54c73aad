import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Video, VideoOff, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/services/auditLog";

const MEET_SPACE_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";

type CloserRow = {
  id: string;
  name: string;
  autoEnabled: boolean;
  connected: boolean;
  hasMeetScope: boolean;
  autoCount: number;
  fallbackCount: number;
};

/**
 * Painel de rollout da gravação automática do Meet.
 * Mostra, por closer, o estado da conexão Google (com/sem o escopo de gravação),
 * se a flag está ligada e quantas reuniões saíram no modo automático x fallback
 * nos últimos 14 dias. Permite liberar/desligar em lotes (ondas seguras).
 */
export default function MeetRolloutPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["meet-rollout-status"],
    queryFn: async (): Promise<CloserRow[]> => {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const [closersRes, tokensRes, logsRes] = await Promise.all([
        supabase
          .from("closers")
          .select("id, name, active, auto_recording_enabled")
          .eq("active", true)
          .order("name"),
        supabase.from("closer_google_tokens").select("closer_id, granted_scopes"),
        supabase
          .from("audit_logs")
          .select("details, created_at")
          .eq("action", "meet_auto_recording")
          .gte("created_at", since),
      ]);

      const tokenMap = new Map<string, boolean>();
      (tokensRes.data ?? []).forEach((t: any) => {
        tokenMap.set(
          t.closer_id,
          typeof t.granted_scopes === "string" && t.granted_scopes.includes(MEET_SPACE_SCOPE),
        );
      });

      const counts = new Map<string, { auto: number; fallback: number }>();
      (logsRes.data ?? []).forEach((l: any) => {
        const closerId = l.details?.closer_id as string | undefined;
        const mode = l.details?.mode as string | undefined;
        if (!closerId) return;
        const cur = counts.get(closerId) ?? { auto: 0, fallback: 0 };
        if (mode === "auto") cur.auto += 1;
        else cur.fallback += 1;
        counts.set(closerId, cur);
      });

      return (closersRes.data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        autoEnabled: c.auto_recording_enabled === true,
        connected: tokenMap.has(c.id),
        hasMeetScope: tokenMap.get(c.id) === true,
        autoCount: counts.get(c.id)?.auto ?? 0,
        fallbackCount: counts.get(c.id)?.fallback ?? 0,
      }));
    },
  });

  const summary = useMemo(() => {
    const total = rows.length;
    const enabled = rows.filter((r) => r.autoEnabled).length;
    const ready = rows.filter((r) => r.hasMeetScope).length;
    const pending = rows.filter((r) => r.autoEnabled && !r.hasMeetScope).length;
    const auto = rows.reduce((s, r) => s + r.autoCount, 0);
    const fallback = rows.reduce((s, r) => s + r.fallbackCount, 0);
    return { total, enabled, ready, pending, auto, fallback };
  }, [rows]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulk = async (enable: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("closers")
        .update({ auto_recording_enabled: enable } as any)
        .in("id", ids);
      if (error) throw error;

      const names = rows.filter((r) => ids.includes(r.id)).map((r) => r.name);
      await logAudit({
        action: enable ? "meet_auto_recording_bulk_enable" : "meet_auto_recording_bulk_disable",
        entityType: "closer",
        details: { closer_ids: ids, closers: names, total: ids.length },
      });

      toast.success(
        `${enable ? "Gravação automática ativada" : "Gravação automática desativada"} para ${ids.length} closer(s).`,
      );
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["meet-rollout-status"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-users"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao aplicar alteração em lote");
    }
    setSaving(false);
  };

  const statusOf = (r: CloserRow) => {
    if (!r.connected) return { label: "Google não conectado", icon: XCircle, cls: "text-destructive" };
    if (!r.hasMeetScope)
      return { label: "Conectado — falta permissão de gravação", icon: AlertTriangle, cls: "text-yellow-500" };
    return { label: "Pronto para gravação automática", icon: CheckCircle2, cls: "text-primary" };
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/10 bg-card p-5 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Video className="h-4 w-4 text-primary" />
          Rollout da gravação automática do Meet
        </h3>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: "Closers ativos", value: summary.total },
                { label: "Com flag ligada", value: summary.enabled },
                { label: "Com permissão OK", value: summary.ready },
                { label: "Aguardando reconexão", value: summary.pending },
                { label: "Reuniões auto / fallback (14d)", value: `${summary.auto} / ${summary.fallback}` },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-secondary/50 px-3 py-2">
                  <p className="text-lg font-semibold">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{m.label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="gap-2"
                disabled={selected.size === 0 || saving}
                onClick={() => applyBulk(true)}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                Ativar para selecionados ({selected.size})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={selected.size === 0 || saving}
                onClick={() => applyBulk(false)}
              >
                <VideoOff className="h-3.5 w-3.5" />
                Desativar selecionados
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() =>
                  setSelected(new Set(rows.filter((r) => r.hasMeetScope && !r.autoEnabled).map((r) => r.id)))
                }
              >
                Selecionar prontos e ainda desligados
              </Button>
              {selected.size > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Limpar seleção
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Recomendado liberar em ondas (por exemplo 5 closers por dia) e acompanhar a coluna
              auto/fallback antes da onda seguinte. Closers sem a permissão de gravação continuam no
              fluxo atual — eles verão um aviso para reautorizar o Google.
            </p>

            <div className="space-y-2">
              {rows.map((r) => {
                const st = statusOf(r);
                const Icon = st.icon;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleSelect(r.id)}
                        aria-label={`Selecionar ${r.name}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className={`flex items-center gap-1 text-xs ${st.cls}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {st.label}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        auto {r.autoCount} / fallback {r.fallbackCount}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          r.autoEnabled
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.autoEnabled ? "gravação ativa" : "desligada"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum closer ativo encontrado.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
