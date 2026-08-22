/**
 * Coleta os dados de rastreamento do Meta (Facebook) para o lead no momento
 * do agendamento. Os valores vêm do cadastro do lead no DataCrazy/Formulário
 * (onde fbp/fbc foram capturados no navegador do cliente) e, como fallback,
 * dos cookies _fbp/_fbc presentes no navegador atual.
 *
 * O envio dos eventos é feito exclusivamente no backend (Edge Function).
 */

const GS_ID_RE = /GS-[A-Z0-9]{4,}/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UF_RE = /^[A-Z]{2}$/;

export interface LeadMetaFields {
  meta_lead_id: string | null;
  lead_email: string | null;
  lead_state: string | null;
  fbp: string | null;
  fbc: string | null;
  client_ip_address: string | null;
  client_user_agent: string | null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Percorre o objeto do lead (inclui campos customizados) buscando valores úteis. */
function walk(value: unknown, visit: (key: string, val: string) => void, depth = 0) {
  if (depth > 4 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") visit(k.toLowerCase(), String(v));
    else walk(v, visit, depth + 1);
  }
}

export function collectLeadMetaFields(lead: unknown): LeadMetaFields {
  let metaLeadId: string | null = null;
  let email: string | null = null;
  let state: string | null = null;
  let fbp: string | null = null;
  let fbc: string | null = null;
  let ip: string | null = null;
  let ua: string | null = null;

  // Se o lead já veio com o campo "Lead ID" do DataCrazy extraído pelo proxy,
  // usamos ele diretamente (formato GS-XXXX).
  if (lead && typeof lead === "object" && "meta_lead_id" in lead) {
    const direct = (lead as Record<string, unknown>).meta_lead_id;
    if (typeof direct === "string" && direct.trim()) {
      metaLeadId = direct.trim().toUpperCase();
    }
  }

  walk(lead, (key, raw) => {
    const val = raw.trim();
    if (!val) return;

    if (!fbp && /(^|_)fbp$/.test(key) && val.startsWith("fb.")) fbp = val;
    if (!fbc && /(^|_)fbc$/.test(key) && val.startsWith("fb.")) fbc = val;
    if (!ip && /(client_)?ip(_address)?$/.test(key)) ip = val;
    if (!ua && /user_agent/.test(key)) ua = val;
    if (!email && (key.includes("email") || key.includes("mail")) && EMAIL_RE.test(val)) {
      email = val.toLowerCase();
    }
    if (!state && /(state|uf|estado)$/.test(key) && UF_RE.test(val.toUpperCase())) {
      state = val.toUpperCase();
    }
    if (!metaLeadId) {
      const m = val.match(GS_ID_RE);
      if (m) metaLeadId = m[0].toUpperCase();
    }
  });

  return {
    meta_lead_id: metaLeadId,
    lead_email: email,
    lead_state: state,
    fbp: fbp ?? readCookie("_fbp"),
    fbc: fbc ?? readCookie("_fbc"),
    client_ip_address: ip,
    client_user_agent: ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : null),
  };
}
