import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function refresh(rt: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: rt,
      grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => null);
  return r.ok && d?.access_token ? { token: d.access_token as string, exp: d.expires_in as number } : null;
}

// Só letras/números, sem acentos: "André Sechi" -> "andresechi".
const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const EMPRESA_DOMINIO = "@ogruposilva.com.br";

// Casa o displayName da conta Google com o usuário do e-mail corporativo.
// Referência é SEMPRE o e-mail (@ogruposilva.com.br), nunca o nome cadastrado no sistema.
function ehEquipe(displayName: string, prefixos: Set<string>) {
  const inteiro = slug(displayName);
  if (!inteiro) return false;
  if (prefixos.has(inteiro)) return true;
  const palavras = displayName.split(/\s+/).map(slug).filter((w) => w.length >= 2);
  if (palavras.length === 0) return false;
  const primeiro = palavras[0];
  const ultimo = palavras[palavras.length - 1];
  for (const p of prefixos) {
    if (p.length < 4) continue;
    // "João Victor Pinheiro Pereira" -> joaovictorpereira
    if (palavras.length >= 2 && p.startsWith(primeiro) && p.endsWith(ultimo)) return true;
    // "Magda Brito Cunha" -> magdacunha ; "Bruna Angélica" -> bruna
    if (p === primeiro + ultimo || p === primeiro) return true;
    if (inteiro.startsWith(p) || p.startsWith(inteiro)) return true;
  }
  return false;
}

type Presenca = "ambos" | "lead" | "closer" | "nenhum" | "desconhecido";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "Unauthorized" }, 401);

  const { ids } = await req.json().catch(() => ({ ids: [] }));
  if (!Array.isArray(ids) || ids.length === 0) return json({ items: {} });

  // Só lê reuniões que o usuário pode ver (RLS).
  const { data: ags } = await userClient
    .from("agendamentos")
    .select("id, meet_link, closer_id, closers(name)")
    .in("id", ids.slice(0, 80));

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const closerIds = [...new Set((ags ?? []).map((a) => a.closer_id).filter(Boolean))] as string[];
  const { data: toks } = closerIds.length
    ? await admin.from("closer_google_tokens").select("*").in("closer_id", closerIds)
    : { data: [] as any[] };
  const tokenCache = new Map<string, string | null>();

  async function tokenFor(closerId: string) {
    if (tokenCache.has(closerId)) return tokenCache.get(closerId)!;
    const t = (toks ?? []).find((x: any) => x.closer_id === closerId);
    let at: string | null = null;
    if (t) {
      if (new Date(t.token_expiry).getTime() - 60_000 > Date.now()) at = t.access_token;
      else {
        const r = await refresh(t.refresh_token);
        if (r) {
          at = r.token;
          await admin.from("closer_google_tokens").update({
            access_token: r.token,
            token_expiry: new Date(Date.now() + r.exp * 1000).toISOString(),
          }).eq("closer_id", closerId);
        }
      }
    }
    tokenCache.set(closerId, at);
    return at;
  }

  // Nomes de toda a equipe Grupo Silva (closers + usuários cadastrados).
  const [{ data: cls }, { data: profs }] = await Promise.all([
    admin.from("closers").select("name"),
    admin.from("profiles").select("full_name, email"),
  ]);
  const equipe = new Set<string>();
  (cls ?? []).forEach((c: any) => c.name && equipe.add(norm(c.name)));
  (profs ?? []).forEach((p: any) => {
    if (p.full_name && String(p.email ?? "").toLowerCase().endsWith("@ogruposilva.com.br")) equipe.add(norm(p.full_name));
  });

  const items: Record<string, { presenca: Presenca; participantes: string[]; motivo?: string }> = {};

  await Promise.all((ags ?? []).map(async (a: any) => {
    const code = (a.meet_link ?? "").match(/meet\.google\.com\/([a-z0-9-]+)/i)?.[1];
    if (!code || !a.closer_id) {
      items[a.id] = { presenca: "desconhecido", participantes: [], motivo: !code ? "sem_link" : "sem_closer" };
      return;
    }
    const at = await tokenFor(a.closer_id);
    if (!at) { items[a.id] = { presenca: "desconhecido", participantes: [], motivo: "sem_google" }; return; }
    const h = { Authorization: `Bearer ${at}` };
    try {
      const filter = encodeURIComponent(`space.meeting_code = "${code}" AND end_time IS NULL`);
      const rc = await fetch(`https://meet.googleapis.com/v2/conferenceRecords?filter=${filter}`, { headers: h });
      if (!rc.ok) {
        items[a.id] = { presenca: "desconhecido", participantes: [], motivo: `google_${rc.status}` };
        return;
      }
      const recs = (await rc.json()).conferenceRecords ?? [];
      if (recs.length === 0) { items[a.id] = { presenca: "nenhum", participantes: [] }; return; }
      const pf = encodeURIComponent("latest_end_time IS NULL");
      const rp = await fetch(`https://meet.googleapis.com/v2/${recs[0].name}/participants?filter=${pf}&pageSize=50`, { headers: h });
      if (!rp.ok) {
        items[a.id] = { presenca: "desconhecido", participantes: [], motivo: `google_${rp.status}` };
        return;
      }
      const parts = (await rp.json()).participants ?? [];
      let closer = false, lead = false;
      const nomes: string[] = [];
      for (const p of parts) {
        const dn: string = p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? "";
        nomes.push(dn || "Participante");
        const n = norm(dn);
        // Qualquer pessoa da equipe (closers ou usuários cadastrados) conta como closer/equipe.
        const isCloser = !!p.signedinUser && n.length > 0 && equipe.has(n);
        if (isCloser) closer = true; else lead = true;
      }
      items[a.id] = {
        presenca: closer && lead ? "ambos" : closer ? "closer" : lead ? "lead" : "nenhum",
        participantes: nomes,
      };
    } catch (e) {
      items[a.id] = { presenca: "desconhecido", participantes: [], motivo: String(e).slice(0, 80) };
    }
  }));

  return json({ items });
});
