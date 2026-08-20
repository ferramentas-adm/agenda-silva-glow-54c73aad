import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_BASE = "https://api.api4com.com/api/v1";
const TOKEN = Deno.env.get("API4COM_API_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digits(v: string) {
  return (v || "").replace(/\D/g, "");
}

/** Normaliza número brasileiro para discagem (DDD + número, sem +55). */
function normalizeBr(phone: string) {
  let d = digits(phone);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  d = d.replace(/^0+/, "");
  return d;
}

async function api4com(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      // A API4COM espera o token puro no header Authorization.
      Authorization: TOKEN,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    /* mantém texto */
  }
  return { ok: res.ok, status: res.status, body: parsed, path };
}

/** Descobre o ramal do usuário na API4COM casando pelo e-mail. */
async function findExtensionByEmail(email: string) {
  const r = await api4com("/extensions");
  const tried = [{ path: "/extensions", status: r.status }];
  if (!r.ok || !r.body) return { extension: null as string | null, tried };
  const raw: any = r.body;
  const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  const hit = list.find(
    (x) => String(x?.email_address ?? x?.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  const ext = hit ? String(hit.ramal ?? hit.extension ?? "") : "";
  return { extension: ext || null, tried };
}

/** Origina a chamada (click-to-call) via POST /dialer. */
async function originateCall(extension: string, destination: string) {
  const r = await api4com("/dialer", {
    method: "POST",
    body: JSON.stringify({ from: extension, to: destination }),
  });
  const attempts = [{ path: "/dialer", status: r.status, body: r.body }];
  if (!r.ok) return { ok: false, callId: null, raw: r.body, attempts };
  const b: any = r.body ?? {};
  const callId = b?.id ?? b?.call_id ?? b?.uuid ?? b?.data?.id ?? null;
  return { ok: true, callId: callId ? String(callId) : null, raw: r.body, attempts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!TOKEN) return json({ error: "API4COM_API_TOKEN não configurado" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Não autenticado" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(url, service);

    const payload = await req.json().catch(() => ({}));
    const agendamentoId: string | null = payload?.agendamento_id ?? null;
    const leadName: string | null = payload?.lead_name ?? null;
    const rawPhone: string = payload?.lead_phone ?? "";
    const destination = normalizeBr(rawPhone);
    if (!destination) return json({ error: "Telefone do lead inválido" }, 400);

    // ─── ramal do usuário ───────────────────────────────────
    const { data: profile } = await admin
      .from("profiles")
      .select("api4com_extension, email, full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    let extension: string | null = profile?.api4com_extension ?? null;
    let discovery: unknown = null;

    if (!extension) {
      const email = profile?.email ?? user.email ?? "";
      if (email) {
        const found = await findExtensionByEmail(email);
        discovery = found.tried;
        if (found.extension) {
          extension = found.extension;
          await admin.from("profiles").update({ api4com_extension: extension }).eq("user_id", user.id);
        }
      }
    }

    if (!extension) {
      return json(
        {
          error: "no_extension",
          message:
            "Não encontramos seu ramal na API4COM. Cadastre o ramal em Administração ou use a discagem local.",
          fallback: "tel",
          discovery,
        },
        409,
      );
    }

    // ─── originação ─────────────────────────────────────────
    const result = await originateCall(extension, destination);

    const { data: chamada } = await admin
      .from("chamadas")
      .insert({
        agendamento_id: agendamentoId,
        lead_name: leadName,
        lead_phone: rawPhone,
        called_by: user.id,
        caller_extension: extension,
        provider_call_id: result.callId,
        status: result.ok ? "iniciada" : "falha_originacao",
        raw_payload: (result.raw ?? { attempts: result.attempts }) as Record<string, unknown>,
      })
      .select("id")
      .single();

    // ─── log de auditoria ───────────────────────────────────
    const { data: log } = await admin
      .from("audit_logs")
      .insert({
        user_id: user.id,
        user_name: profile?.full_name ?? user.email ?? "Usuário",
        user_email: profile?.email ?? user.email ?? null,
        action: "call_lead",
        entity_type: "agendamento",
        entity_id: agendamentoId,
        details: {
          lead_name: leadName,
          lead_phone: rawPhone,
          extension,
          provider: "api4com",
          provider_call_id: result.callId,
          chamada_id: chamada?.id ?? null,
          resultado: result.ok ? "chamada solicitada" : "falha ao solicitar chamada",
        },
      })
      .select("id")
      .single();

    if (chamada?.id && log?.id) {
      await admin.from("chamadas").update({ audit_log_id: log.id }).eq("id", chamada.id);
    }

    if (!result.ok) {
      console.error("api4com originate failed", JSON.stringify(result.attempts));
      return json(
        {
          error: "originate_failed",
          message: "A API4COM não aceitou a solicitação de chamada. Use a discagem local.",
          fallback: "tel",
          attempts: result.attempts,
        },
        502,
      );
    }

    return json({
      success: true,
      chamada_id: chamada?.id ?? null,
      provider_call_id: result.callId,
      extension,
    });
  } catch (e) {
    console.error("api4com-call error", e);
    return json({ error: String(e) }, 500);
  }
});
