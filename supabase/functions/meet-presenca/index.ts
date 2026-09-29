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

const PARTICULAS = new Set(["da", "de", "do", "dos", "das", "e"]);
const palavras = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter((w) => w.length >= 2 && !PARTICULAS.has(w));

/**
 * "Igor Occon" casa com "Igor Matheus Occon Manoel": mesmo primeiro nome e
 * todos os demais nomes exibidos fazem parte do nome oficial. Exige ≥2 palavras.
 */
function casaNome(exibido: string[], oficial: string[]): boolean {
  if (exibido.length < 2 || oficial.length < 2) return false;
  if (exibido[0] !== oficial[0]) return false;
  const resto = new Set(oficial.slice(1));
  return exibido.slice(1).every((w) => resto.has(w));
}

type Classe = "equipe" | "lead" | "ambiguo";

function classificar(displayName: string, assinado: boolean, equipe: string[][], leadNome: string): Classe {
  const dn = palavras(displayName);
  if (!assinado || dn.length < 2) return "lead";
  const ehEquipe = equipe.some((of) => casaNome(dn, of));
  if (!ehEquipe) return "lead";
  const ld = palavras(leadNome);
  const ehLead = casaNome(dn, ld) || casaNome(ld, dn);
  return ehLead ? "ambiguo" : "equipe";
}

type Presenca = "ambos" | "lead" | "closer" | "nenhum" | "ambiguo" | "desconhecido";

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
    .select(
      "id, meet_link, closer_id, lead_name, closers(name), torre_presenca_confirmada, torre_primeira_deteccao_at, torre_tempo_juntos_minutos",
    )
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

  // Referência de equipe = nome oficial da conta Google Workspace guardado em
  // background (closers.google_name), vinculado por e-mail corporativo.
  // Os nomes comerciais exibidos no sistema são ignorados de propósito.
  // Closers + todos os usuários do sistema (gestores, SDRs, closers em
  // treinamento acompanhando a call) contam como equipe.
  const [{ data: cls }, { data: pfs }] = await Promise.all([
    admin.from("closers").select("google_name"),
    admin.from("profiles").select("google_name").eq("active", true),
  ]);
  const equipe: string[][] = [];
  [...(cls ?? []), ...(pfs ?? [])].forEach((c: any) => {
    const w = palavras(String(c.google_name ?? ""));
    if (w.length >= 2) equipe.push(w);
  });

  type Item = {
    presenca: Presenca;
    participantes: string[];
    motivo?: string;
    /** Minutos em que lead e closer estiveram juntos na sala (auditoria da Torre). */
    tempoJuntosMinutos?: number;
    /** Primeira vez que a Torre viu lead e closer juntos nesta reunião. */
    primeiraDeteccaoAt?: string;
    presencaAuditada?: boolean;
  };
  const items: Record<string, Item> = {};

  // Nome de quem está com a Torre aberta — vai para o registro de auditoria.
  const { data: quem } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", u.user.id)
    .maybeSingle();

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
      if (recs.length === 0) {
        items[a.id] = {
          presenca: "nenhum",
          participantes: [],
          presencaAuditada: !!a.torre_presenca_confirmada,
          tempoJuntosMinutos: a.torre_tempo_juntos_minutos ?? undefined,
          primeiraDeteccaoAt: a.torre_primeira_deteccao_at ?? undefined,
        };
        return;
      }
      const pf = encodeURIComponent("latest_end_time IS NULL");
      const rp = await fetch(`https://meet.googleapis.com/v2/${recs[0].name}/participants?filter=${pf}&pageSize=50`, { headers: h });
      if (!rp.ok) {
        items[a.id] = { presenca: "desconhecido", participantes: [], motivo: `google_${rp.status}` };
        return;
      }
      const parts = (await rp.json()).participants ?? [];
      let closer = false, lead = false, ambiguo = false;
      const nomes: string[] = [];
      // Entrada mais antiga de cada lado — o cruzamento dos dois intervalos é o
      // tempo real em que as duas pessoas ficaram juntas na sala.
      let entradaEquipe: number | null = null;
      let entradaLead: number | null = null;
      for (const p of parts) {
        const dn: string = p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? p.phoneUser?.displayName ?? "";
        nomes.push(dn || "Participante");
        const classe = classificar(dn, !!p.signedinUser, equipe, String(a.lead_name ?? ""));
        const inicio = p.earliestStartTime ? new Date(p.earliestStartTime).getTime() : NaN;
        const marca = (atual: number | null) =>
          Number.isFinite(inicio) ? (atual === null ? inicio : Math.min(atual, inicio)) : atual;
        if (classe === "ambiguo") ambiguo = true;
        else if (classe === "equipe") { closer = true; entradaEquipe = marca(entradaEquipe); }
        else { lead = true; entradaLead = marca(entradaLead); }
      }
      const presenca: Presenca = ambiguo
        ? "ambiguo"
        : closer && lead ? "ambos" : closer ? "closer" : lead ? "lead" : "nenhum";

      const item: Item = {
        presenca,
        participantes: nomes,
        ...(ambiguo ? { motivo: "homonimo" } : {}),
        presencaAuditada: !!a.torre_presenca_confirmada,
        tempoJuntosMinutos: a.torre_tempo_juntos_minutos ?? undefined,
        primeiraDeteccaoAt: a.torre_primeira_deteccao_at ?? undefined,
      };

      if (presenca === "ambos") {
        const agora = Date.now();
        // Momento em que o segundo dos dois entrou na sala.
        const juntosDesde = entradaEquipe !== null && entradaLead !== null
          ? Math.max(entradaEquipe, entradaLead)
          : null;
        const primeira = a.torre_primeira_deteccao_at
          ? new Date(a.torre_primeira_deteccao_at).toISOString()
          : new Date(juntosDesde ?? agora).toISOString();
        const decorrido = Math.max(0, Math.floor((agora - new Date(primeira).getTime()) / 60000));
        const minutos = Math.max(Number(a.torre_tempo_juntos_minutos ?? 0), decorrido);

        item.presencaAuditada = true;
        item.primeiraDeteccaoAt = primeira;
        item.tempoJuntosMinutos = minutos;

        await admin.from("agendamentos").update({
          torre_presenca_confirmada: true,
          torre_primeira_deteccao_at: primeira,
          torre_ultima_deteccao_at: new Date(agora).toISOString(),
          torre_tempo_juntos_minutos: minutos,
          torre_participantes: nomes,
        }).eq("id", a.id);

        // Registro único de auditoria: só na primeira vez que a Torre valida a reunião.
        if (!a.torre_presenca_confirmada) {
          await admin.from("audit_logs").insert({
            user_id: u.user.id,
            user_name: quem?.full_name ?? "Torre de Controle",
            user_email: quem?.email ?? null,
            action: "torre_presenca_detectada",
            entity_type: "agendamento",
            entity_id: a.id,
            details: {
              lead_name: a.lead_name,
              closer_nome: a.closers?.name ?? null,
              participantes: nomes,
              detectado_em: primeira,
            },
          });
        }
      }

      items[a.id] = item;
    } catch (e) {
      items[a.id] = { presenca: "desconhecido", participantes: [], motivo: String(e).slice(0, 80) };
    }
  }));

  return json({ items });
});
