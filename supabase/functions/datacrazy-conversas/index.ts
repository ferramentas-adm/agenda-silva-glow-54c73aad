import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const INSTANCE = "6aaed957bfce5b063bb12a80";
const API = "https://api.g1.datacrazy.io/api/v1";

type Item = { conversationId: string | null; aguardando: boolean; ultimaMsgLead: string | null; debug?: unknown };
// Cache compartilhado entre chamadas enquanto a instância está quente (30s).
const cache = new Map<string, { at: number; v: Item }>();

const digits = (s: string) => String(s ?? "").replace(/\D/g, "");
const comDdi = (d: string) => (d.startsWith("55") ? d : `55${d}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const phones: string[] = Array.isArray(body?.phones) ? body.phones.map(digits).filter((p: string) => p.length >= 10).slice(0, 60) : [];
  const debug = !!body?.debug;
  const token = Deno.env.get("DATACRAZY_API_TOKEN");
  if (!token) return json({ error: "DATACRAZY_API_TOKEN ausente" }, 500);

  const items: Record<string, Item> = {};
  await Promise.all(phones.map(async (p) => {
    const tel = comDdi(p);
    const hit = cache.get(tel);
    if (hit && Date.now() - hit.at < 30_000 && !debug) { items[p] = hit.v; return; }
    try {
      const qs = new URLSearchParams({ search: tel, take: "10" });
      const r = await fetch(`${API}/conversations?${qs}`, {
        headers: { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      const txt = await r.text();
      if (!r.ok) { items[p] = { conversationId: null, aguardando: false, ultimaMsgLead: null, debug: debug ? { status: r.status, txt: txt.slice(0, 500) } : undefined }; return; }
      const d = JSON.parse(txt);
      const list: any[] = Array.isArray(d) ? d : d?.data ?? [];
      // Só a conversa da instância do time (SDR) cujo contato tem exatamente este telefone.
      const match = list.find((c) => {
        const cp = digits(c?.contact?.phoneNumber ?? c?.contact?.contactId ?? "");
        return c?.instance?.id === INSTANCE && cp === tel;
      }) ?? null;
      const rec = match?.lastReceivedMessageDate ? Date.parse(match.lastReceivedMessageDate) : 0;
      const sent = match?.lastSendedMessageDate ? Date.parse(match.lastSendedMessageDate) : 0;
      const v: Item = {
        conversationId: match?.id ?? null,
        aguardando: !!match && rec > sent,
        ultimaMsgLead: match?.lastReceivedMessageDate ?? null,
        ...(debug ? { debug: { total: list.length, sample: list.slice(0, 2) } } : {}),
      };
      cache.set(tel, { at: Date.now(), v });
      items[p] = v;
    } catch (e) {
      items[p] = { conversationId: null, aguardando: false, ultimaMsgLead: null, debug: debug ? String(e) : undefined };
    }
  }));
  return json({ items });
});
