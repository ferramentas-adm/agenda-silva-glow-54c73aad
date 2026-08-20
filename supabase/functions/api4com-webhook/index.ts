import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Códigos/status da API4COM → texto legível em português. */
const STATUS_LABELS: Record<string, string> = {
  // hangup_cause (FreeSWITCH) documentado pela API4COM
  NORMAL_CLEARING: "Atendida",
  USER_BUSY: "Ocupado",
  UNALLOCATED_NUMBER: "Número não encontrado",
  NUMBER_CHANGED: "Caixa postal",
  ORIGINATOR_CANCEL: "Cancelamento da ligação",
  ALLOTTED_TIMEOUT: "Tempo expirado",
  NO_USER_RESPONSE: "Não atendeu",
  NO_ANSWER_TIMEOUT: "Não atendeu",
  ANSWER: "Atendeu",
  ANSWERED: "Atendeu",
  COMPLETED: "Atendeu",
  NOANSWER: "Não atendeu",
  "NO ANSWER": "Não atendeu",
  NO_ANSWER: "Não atendeu",
  BUSY: "Ocupado",
  CANCEL: "Cancelada",
  CANCELLED: "Cancelada",
  FAILED: "Falha / sem sinal",
  CONGESTION: "Falha / sem sinal",
  CHANUNAVAIL: "Número indisponível",
  VOICEMAIL: "Caixa postal",
  MACHINE: "Caixa postal / secretária",
  REJECTED: "Recusada",
  ABANDON: "Abandonada",
};

function labelFor(code: string | null, duration: number | null) {
  if (!code) return duration && duration > 0 ? "Atendeu" : "Sem resultado informado";
  const key = String(code).toUpperCase().trim();
  return STATUS_LABELS[key] ?? `Status ${code}`;
}

function pick<T = unknown>(obj: Record<string, any>, keys: string[]): T | null {
  for (const k of keys) {
    const v = k.split(".").reduce<any>((acc, part) => (acc == null ? acc : acc[part]), obj);
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const expected = Deno.env.get("EXTERNAL_WEBHOOK_TOKEN") ?? "";
    const url = new URL(req.url);
    const provided = req.headers.get("x-webhook-token") ?? url.searchParams.get("token") ?? "";
    if (expected && provided !== expected) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const data: Record<string, any> = body?.data && typeof body.data === "object" ? { ...body, ...body.data } : body;

    const callId = pick<string>(data, ["call_id", "callId", "id", "uuid", "unique_id", "uniqueid"]);
    const phone = pick<string>(data, ["to", "destination", "destination_number", "called_number", "number"]);
    const code = pick<string>(data, ["status", "disposition", "call_status", "hangup_cause", "result", "state"]);
    const durationRaw = pick<number | string>(data, [
      "duration",
      "billsec",
      "talk_time",
      "talking_time",
      "call_duration",
    ]);
    const duration = durationRaw != null ? Math.round(Number(durationRaw)) || 0 : null;
    const answeredAt = pick<string>(data, ["answered_at", "answer_time", "answered"]);
    const endedAt = pick<string>(data, ["ended_at", "end_time", "hangup_at", "finished_at"]);
    const recording = pick<string>(data, ["recording_url", "record_url", "recording"]);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Localiza a chamada: por id do provedor ou pela última chamada aberta do telefone.
    let chamada: any = null;
    if (callId) {
      const { data: byId } = await admin
        .from("chamadas")
        .select("id, audit_log_id, lead_name, lead_phone")
        .eq("provider_call_id", String(callId))
        .maybeSingle();
      chamada = byId ?? null;
    }
    if (!chamada && phone) {
      const digits = String(phone).replace(/\D/g, "").slice(-8);
      const { data: byPhone } = await admin
        .from("chamadas")
        .select("id, audit_log_id, lead_name, lead_phone")
        .ilike("lead_phone", `%${digits}%`)
        .eq("status", "iniciada")
        .order("started_at", { ascending: false })
        .limit(1);
      chamada = byPhone?.[0] ?? null;
    }

    if (!chamada) {
      console.warn("api4com-webhook: chamada não localizada", JSON.stringify({ callId, phone }));
      return json({ received: true, matched: false });
    }

    const statusLabel = labelFor(code, duration);
    const finalStatus = duration && duration > 0 ? "atendida" : "nao_atendida";

    await admin
      .from("chamadas")
      .update({
        status: finalStatus,
        status_code: code ? String(code) : null,
        status_label: statusLabel,
        duration_seconds: duration,
        answered_at: answeredAt ? new Date(answeredAt).toISOString() : null,
        ended_at: endedAt ? new Date(endedAt).toISOString() : new Date().toISOString(),
        provider_call_id: callId ? String(callId) : undefined,
        raw_payload: body,
      })
      .eq("id", chamada.id);

    // Complementa o log de auditoria com o desfecho da ligação.
    if (chamada.audit_log_id) {
      const { data: log } = await admin
        .from("audit_logs")
        .select("details")
        .eq("id", chamada.audit_log_id)
        .maybeSingle();
      const details = (log?.details ?? {}) as Record<string, unknown>;
      await admin
        .from("audit_logs")
        .update({
          details: {
            ...details,
            status_code: code ?? null,
            status_label: statusLabel,
            duracao_segundos: duration,
            duracao: duration != null ? `${Math.floor(duration / 60)}m ${duration % 60}s` : null,
            recording_url: recording ?? null,
            resultado: statusLabel,
          },
        })
        .eq("id", chamada.audit_log_id);
    }

    return json({ received: true, matched: true, status: statusLabel, duration });
  } catch (e) {
    console.error("api4com-webhook error", e);
    return json({ error: String(e) }, 500);
  }
});
