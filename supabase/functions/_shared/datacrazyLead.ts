// Acesso direto à API do DataCrazy para o SDR IA (best effort, nunca lança).
// Replica as regras do datacrazy-proxy (normalização de URL, fallback g1,
// leitura do campo adicional "Lead ID") porque o proxy exige JWT de usuário.
// deno-lint-ignore-file no-explicit-any

const WEBHOOK_PATH_FRAGMENT = "/api/crm/flows/webhooks/";
const DATACRAZY_CRM_URL = "https://crm.g1.datacrazy.io/api/crm";
const LEAD_ID_FIELD_ID = "9aced571-21e8-403f-aa22-33922db57f22";
const GS_ID_RE = /GS-[A-Z0-9]{4,}/i;
const TIMEOUT_MS = 8_000;

function normalizeApiUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  const pathname = parsed.pathname.replace(/\/+$/, "");
  if (pathname.includes(WEBHOOK_PATH_FRAGMENT)) {
    return `${parsed.origin}${pathname.split(WEBHOOK_PATH_FRAGMENT)[0]}`;
  }
  const resourceLike = new Set(["leads", "businesses", "tags", "lists", "pipelines", "stages", "activities"]);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length && resourceLike.has(segments.at(-1)!)) segments.pop();
  return segments.length ? `${parsed.origin}/${segments.join("/")}` : `${parsed.origin}/api/v1`;
}

function env() {
  const rawUrl = Deno.env.get("DATACRAZY_API_URL");
  const token = Deno.env.get("DATACRAZY_API_TOKEN");
  if (!rawUrl || !token) return null;
  return { base: normalizeApiUrl(rawUrl), token };
}

async function dc(method: string, path: string, payload?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const cfg = env();
  if (!cfg) return { ok: false, status: 0, data: null };
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: cfg.token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (payload && method !== "GET") init.body = JSON.stringify(payload);
  let url = `${cfg.base}${path.startsWith("/") ? path : `/${path}`}`;
  let res = await fetch(url, init);
  if (res.status === 404 && new URL(url).hostname === "api.datacrazy.io") {
    const u = new URL(url); u.hostname = "api.g1.datacrazy.io"; url = u.toString();
    res = await fetch(url, init);
  }
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

let tagCache: { id: string; at: number } | null = null;

/** Resolve o id da tag pelo nome (cache 10 min). */
export async function resolveTagId(name: string): Promise<string | null> {
  try {
    if (tagCache && Date.now() - tagCache.at < 10 * 60_000) return tagCache.id;
    const res = await dc("GET", "/tags");
    if (!res.ok) return null;
    const tags: any[] = Array.isArray(res.data) ? res.data : res.data?.data || [];
    const t = tags.find((x) => String(x?.name ?? "").toLowerCase() === name.toLowerCase());
    if (!t?.id) return null;
    tagCache = { id: t.id, at: Date.now() };
    return t.id;
  } catch { return null; }
}

/**
 * Garante a tag "agendamento" no lead. Devolve:
 *  - "already" se o lead já tinha a tag, "added" se aplicou, "failed" se não conseguiu.
 */
export async function ensureLeadTag(leadId: string, tagName = "agendamento"): Promise<"already" | "added" | "failed"> {
  try {
    const tagId = await resolveTagId(tagName);
    if (!tagId) return "failed";
    const lead = await dc("GET", `/leads/${encodeURIComponent(leadId)}`);
    if (lead.ok) {
      const tags: any[] = Array.isArray(lead.data?.tags) ? lead.data.tags : lead.data?.data?.tags ?? [];
      if (tags.some((t) => t?.id === tagId || String(t?.name ?? "").toLowerCase() === tagName.toLowerCase())) {
        return "already";
      }
    }
    // Tentativas conhecidas de payload para vincular tag ao lead.
    const attempts: Array<[string, unknown]> = [
      [`/leads/${encodeURIComponent(leadId)}/tags`, { tagId }],
      [`/leads/${encodeURIComponent(leadId)}/tags`, { tagIds: [tagId] }],
      [`/leads/${encodeURIComponent(leadId)}/tags/${encodeURIComponent(tagId)}`, undefined],
    ];
    for (const [path, payload] of attempts) {
      const r = await dc("POST", path, payload);
      if (r.ok) return "added";
    }
    return "failed";
  } catch { return "failed"; }
}

/** Lê o campo adicional "Lead ID" (GS-XXXX) do lead na API do CRM. */
export async function fetchMetaLeadId(leadId: string): Promise<string | null> {
  const cfg = env();
  if (!cfg) return null;
  try {
    const res = await fetch(
      `${DATACRAZY_CRM_URL}/additional-fields/lead/${encodeURIComponent(leadId)}?take=1000&skip=0`,
      { headers: { "Content-Type": "application/json", Authorization: cfg.token }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const parsed = await res.json().catch(() => null);
    const rows: any[] = Array.isArray(parsed) ? parsed : parsed?.data || [];
    let row = rows.find((r) => r?.additionalField?.id === LEAD_ID_FIELD_ID);
    if (!row?.value) {
      row = rows.find((r) => String(r?.additionalField?.name || "").trim().toLowerCase() === "lead id");
    }
    const raw = typeof row?.value === "string" ? row.value.trim() : "";
    if (!raw) return null;
    const m = raw.match(GS_ID_RE);
    return (m ? m[0] : raw).toUpperCase();
  } catch { return null; }
}
