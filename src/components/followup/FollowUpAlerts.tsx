import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, MessageCircle, Phone, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMyCloserId } from "@/hooks/useMyCloserId";
import { useFollowUpAlertOffsets } from "@/hooks/useFollowUpAlertOffsets";
import { brTodayYMD, brNowHour, brNowMinute } from "@/lib/timezone";
import {
  canalLabel, temperaturaBadgeClass, temperaturaLabel, whatsappLink,
} from "@/lib/followUp";
import { FOLLOWUP_SELECT, type FollowUpRecord } from "@/components/followup/types";

/** Toca um toque curto de lembrete (3 bipes) sem depender de arquivo de áudio. */
function playRingtone() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [0, 0.45, 0.9].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now + offset);
      osc.frequency.setValueAtTime(1180, now + offset + 0.14);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.32);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2000);
  } catch {
    /* som é opcional */
  }
}

const firedKey = (vendaId: string, ymd: string, offset: number) =>
  `fu-alert:${ymd}:${vendaId}:${offset}`;

/**
 * Lembretes na tela (pop-up + som) dos follow-ups do dia.
 * Os minutos de antecedência são configuráveis (padrão: 60, 30 e 10 minutos).
 */
export default function FollowUpAlerts() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const { data: myCloserId } = useMyCloserId();
  const { offsets } = useFollowUpAlertOffsets();
  const isCloser = role === "closer";

  const [active, setActive] = useState<{ row: FollowUpRecord; offset: number } | null>(null);
  const [tick, setTick] = useState(0);
  const dismissed = useRef<Set<string>>(new Set());

  const today = brTodayYMD();

  const { data: items = [] } = useQuery({
    queryKey: ["follow-up-alerts", today, myCloserId],
    enabled: !!user && isCloser && !!myCloserId,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(FOLLOWUP_SELECT)
        .eq("follow_up", true)
        .eq("vendeu", false)
        .eq("follow_up_status", "ativo")
        .eq("follow_up_date", today)
        .eq("agendamentos.closer_id", myCloserId!);
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpRecord[];
    },
  });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (active || items.length === 0) return;
    const nowMin = brNowHour() * 60 + brNowMinute();

    for (const row of items) {
      if (!row.follow_up_time) continue;
      const [h, m] = row.follow_up_time.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
      const targetMin = h * 60 + m;

      for (const offset of offsets) {
        const fireAt = targetMin - offset;
        const key = firedKey(row.id, today, offset);
        if (dismissed.current.has(key)) continue;
        if (localStorage.getItem(key)) continue;
        // Dispara quando o momento chegou (ou passou há menos de 5 min).
        if (nowMin >= fireAt && nowMin <= fireAt + 5) {
          localStorage.setItem(key, "1");
          dismissed.current.add(key);
          setActive({ row, offset });
          playRingtone();
          return;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, items, offsets, active, today]);

  if (!active) return null;

  const row = active.row;
  const wa = whatsappLink(row.agendamentos?.lead_phone);

  return (
    <Dialog open onOpenChange={(o) => !o && setActive(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary animate-pulse" />
            Follow-up em {active.offset} minutos
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{row.agendamentos?.lead_name}</span> às{" "}
            {row.follow_up_time} — {canalLabel(row.follow_up_canal)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px]", temperaturaBadgeClass(row.follow_up_temperatura))}>
              {temperaturaLabel(row.follow_up_temperatura)}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              Tentativa {row.follow_up_tentativas ?? 0}/3
            </Badge>
          </div>
          {row.agendamentos?.lead_phone && (
            <p className="text-muted-foreground">Telefone: {row.agendamentos.lead_phone}</p>
          )}
          {row.follow_up_produto && <p className="text-muted-foreground">Produto: {row.follow_up_produto}</p>}
          {row.follow_up_valor != null && (
            <p className="text-muted-foreground">
              Valor combinado: R$ {Number(row.follow_up_valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
          )}
          {row.follow_up_condicoes && (
            <p className="whitespace-pre-wrap text-foreground/80">{row.follow_up_condicoes}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
            <X className="mr-1 h-4 w-4" />
            Depois
          </Button>
          <div className="flex gap-2">
            {row.agendamentos?.lead_phone && row.follow_up_canal !== "whatsapp" && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${row.agendamentos.lead_phone}`}>
                  <Phone className="mr-1 h-4 w-4" />
                  Ligar
                </a>
              </Button>
            )}
            {wa && (
              <Button variant="outline" size="sm" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 h-4 w-4" />
                  WhatsApp
                </a>
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setActive(null);
                navigate("/follow-ups");
              }}
            >
              Abrir follow-ups
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
