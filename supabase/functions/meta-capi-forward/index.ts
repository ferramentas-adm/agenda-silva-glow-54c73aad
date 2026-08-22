// Envia eventos de conversão (Meta CAPI) para o projeto "Formulário Grupo Silva".
// Disparado por triggers do banco: reunião realizada e venda fechada.
// Nunca loga dados pessoais (nome, e-mail, telefone, order_id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const onlyDigits = (v: string) => v.replace(/\D/g, "");

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let d = onlyDigits(raw);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return d;
}

function splitName(full: string | null): { first: string | null; last: string | null } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : null };
}

interface Body {
  event_name?: "ReuniaoRealizada" | "Purchase";
  agendamento_id?: string;
  venda_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const targetUrl = Deno.env.get("META_CAPI_CRM_URL");
  const token = Deno.env.get("META_CAPI_CRM_TOKEN");
  if (!targetUrl || !token) return json({ error: "Missing META_CAPI_CRM config" }, 500);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const eventName = body.event_name;
  const agendamentoId = body.agendamento_id;
  if (!eventName || !agendamentoId) return json({ error: "Missing event_name/agendamento_id" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: ag, error: agErr } = await supabase
    .from("agendamentos")
    .select(
      "id, lead_name, lead_phone, lead_email, lead_state, meta_lead_id, fbp, fbc, client_ip_address, client_user_agent, scheduled_date, scheduled_time, deleted_at",
    )
    .eq("id", agendamentoId)
    .maybeSingle();

  if (agErr) return json({ error: "Lookup failed", code: agErr.code }, 500);
  if (!ag || ag.deleted_at) return json({ skipped: "agendamento_not_found_or_deleted" });

  let venda: { id: string; valor: number | null; closed_at: string | null } | null = null;
  if (eventName === "Purchase") {
    if (body.venda_id) {
      const { data } = await supabase
        .from("vendas")
        .select("id, valor, closed_at")
        .eq("id", body.venda_id)
        .maybeSingle();
      venda = data as typeof venda;
    }
    if (!venda) {
      const { data } = await supabase
        .from("vendas")
        .select("id, valor, closed_at")
        .eq("agendamento_id", agendamentoId)
        .eq("vendeu", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      venda = data as typeof venda;
    }
    if (!venda) return json({ skipped: "venda_not_found" });
  }

  // event_id único e estável → o destino faz a desduplicação no Meta.
  const eventId = eventName === "Purchase" ? `venda-${venda!.id}` : `reuniao-${ag.id}`;

  // Guarda local: evita reenvio se já registramos o mesmo event_id com sucesso.
  const { data: claimed, error: claimErr } = await supabase
    .from("meta_capi_events")
    .insert({
      event_id: eventId,
      event_name: eventName,
      agendamento_id: ag.id,
      venda_id: venda?.id ?? null,
      status: "pending",
    })
    .select("event_id")
    .maybeSingle();

  if (claimErr) {
    if (claimErr.code === "23505") return json({ skipped: "duplicate_event", event_id: eventId });
    return json({ error: "Claim failed", code: claimErr.code }, 500);
  }
  if (!claimed) return json({ skipped: "duplicate_event", event_id: eventId });

  const { first, last } = splitName(ag.lead_name);
  const eventTime = Math.floor(Date.now() / 1000);

  const payload: Record<string, unknown> = {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    country: "BR",
  };

  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "") payload[k] = v;
  };

  put("lead_id", ag.meta_lead_id);
  put("phone", normalizePhone(ag.lead_phone));
  put("email", ag.lead_email ? String(ag.lead_email).trim().toLowerCase() : null);
  put("first_name", first);
  put("last_name", last);
  put("state", ag.lead_state);
  put("fbp", ag.fbp);
  put("fbc", ag.fbc);
  put("client_ip_address", ag.client_ip_address);
  put("client_user_agent", ag.client_user_agent);

  if (eventName === "Purchase") {
    payload.value = Number(venda!.valor ?? 0);
    payload.currency = "BRL";
    payload.order_id = `CONTRATO-${venda!.id}`;
  }

  let responseCode: number | null = null;
  let responseBody = "";
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    responseCode = res.status;
    responseBody = (await res.text()).slice(0, 500);
  } catch (e) {
    responseBody = e instanceof Error ? e.message : "fetch_error";
  }

  const ok = responseCode !== null && responseCode >= 200 && responseCode < 300;

  await supabase
    .from("meta_capi_events")
    .update({
      status: ok ? "sent" : "failed",
      response_code: responseCode,
      response_body: responseBody,
    })
    .eq("event_id", eventId);

  // Log sem PII.
  console.log(
    JSON.stringify({
      event_id: eventId,
      event_name: eventName,
      ok,
      response_code: responseCode,
      has_lead_id: !!ag.meta_lead_id,
      has_fbp: !!ag.fbp,
      has_fbc: !!ag.fbc,
    }),
  );

  if (!ok) {
    // Libera o event_id para nova tentativa futura.
    await supabase.from("meta_capi_events").delete().eq("event_id", eventId);
  }

  return json({ ok, event_id: eventId, response_code: responseCode });
});
