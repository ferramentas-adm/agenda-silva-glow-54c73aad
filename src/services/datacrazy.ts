/**
 * DataCrazy API Service Layer
 * All interactions with the DataCrazy API go through the edge function proxy.
 */

import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff, type RetryOptions } from "@/lib/retryWithBackoff";

// ─── Proxy helper ────────────────────────────────────────────────

// Fila global serializa TODAS as chamadas ao proxy do DataCrazy, evitando
// que múltiplos componentes (AppLayout + LeadSearch, etc.) batam em paralelo
// e estourem o rate-limit (HTTP 429).
//
// C3: A implementação anterior encadeava tudo em `apiChain = apiChain.then(...)`,
// o que mantinha uma corrente de promises crescente na memória por toda a
// sessão. Agora usamos um contador de tarefas pendentes + uma promise "cauda"
// que é resetada para `Promise.resolve()` sempre que a fila esvazia, evitando
// que o histórico de chamadas antigas fique retido pelo garbage collector.
let apiChain: Promise<unknown> = Promise.resolve();
let pendingCount = 0;
const GLOBAL_GAP_MS = 250;
const sleepGlobal = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dedupe de GETs idênticos em voo (cobre React StrictMode / re-renders).
const inFlightGets = new Map<string, Promise<unknown>>();

async function api(method: string, path: string, payload?: unknown, retryOpts?: RetryOptions) {
  const isGet = method.toUpperCase() === "GET";
  const dedupeKey = isGet ? `GET ${path}` : null;
  if (dedupeKey && inFlightGets.has(dedupeKey)) {
    return inFlightGets.get(dedupeKey);
  }

  const run = async () =>
    retryWithBackoff(
      async () => {
        const { data, error } = await supabase.functions.invoke("datacrazy-proxy", {
          body: { method, path, payload },
        });

        if (error) {
          const wrapped = new Error(`DataCrazy proxy error: ${error.message}`) as Error & {
            status?: number;
            context?: unknown;
          };
          wrapped.status = (error as { status?: number }).status;
          wrapped.context = (error as { context?: unknown }).context;
          throw wrapped;
        }
        if (data?.error) throw new Error(`DataCrazy API error: ${data.error}`);
        return data;
      },
      { label: `datacrazy-proxy ${method} ${path}`, ...retryOpts },
    );

  pendingCount += 1;
  const chained = apiChain.then(async () => {
    const result = await run();
    await sleepGlobal(GLOBAL_GAP_MS);
    return result;
  });
  // Mantém a corrente viva mesmo após falhas, mas reseta quando a fila esvazia
  // para não acumular referências indefinidamente.
  apiChain = chained.catch(() => undefined);
  const settled = chained.finally(() => {
    pendingCount -= 1;
    if (pendingCount === 0) {
      apiChain = Promise.resolve();
    }
  });

  if (dedupeKey) {
    inFlightGets.set(dedupeKey, settled);
    settled.finally(() => inFlightGets.delete(dedupeKey));
  }

  return chained;
}


// Settings from app_settings (loaded at runtime)
let settingsCache: Record<string, string> | null = null;

async function getSettings(): Promise<Record<string, string>> {
  if (settingsCache) return settingsCache;
  const { data } = await supabase.from("app_settings").select("key, value");
  const map: Record<string, string> = {};
  (data ?? []).forEach((s: any) => { map[s.key] = s.value; });
  settingsCache = map;
  return map;
}

// Clear cache (call when settings are updated)
export function clearSettingsCache() {
  settingsCache = null;
}

async function getStageId(key: string): Promise<string> {
  const settings = await getSettings();
  return settings[key] || "";
}

// ─── Queue ───────────────────────────────────────────────────────
//
// M7: fila persiste em localStorage para sobreviver a reloads, mas antes
// crescia indefinidamente. Agora aplicamos TTL (24h) + cap (100 itens) em
// toda leitura, descartando itens antigos e mantendo apenas os mais recentes.

const QUEUE_KEY = "datacrazy_sync_queue";
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const QUEUE_MAX_ITEMS = 100;

export interface QueueItem {
  id: string;
  tipo: string;
  passo_falhou: number;
  agendamento: Record<string, unknown>;
  tentativas: number;
  criado_em: string;
  status: "pendente" | "falha_definitiva";
}

function pruneQueue(items: QueueItem[]): QueueItem[] {
  const now = Date.now();
  const fresh = items.filter((it) => {
    const t = Date.parse(it.criado_em);
    return Number.isFinite(t) && now - t < QUEUE_TTL_MS;
  });
  if (fresh.length <= QUEUE_MAX_ITEMS) return fresh;
  // Mantém os últimos QUEUE_MAX_ITEMS (mais recentes).
  return fresh
    .sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em))
    .slice(-QUEUE_MAX_ITEMS);
}

function getQueue(): QueueItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueueItem[];
    const pruned = pruneQueue(Array.isArray(raw) ? raw : []);
    if (pruned.length !== (Array.isArray(raw) ? raw.length : 0)) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(pruned));
    }
    return pruned;
  } catch {
    return [];
  }
}

function setQueue(items: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(pruneQueue(items)));
}

function addToQueue(tipo: string, passo: number, agendamento: Record<string, unknown>) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    tipo,
    passo_falhou: passo,
    agendamento,
    tentativas: 0,
    criado_em: new Date().toISOString(),
    status: "pendente",
  });
  setQueue(queue);
}

export function getPendingQueue(): QueueItem[] {
  return getQueue().filter(i => i.status === "pendente");
}

export function getAllQueue(): QueueItem[] {
  return getQueue();
}

export function markResolved(id: string) {
  const queue = getQueue();
  setQueue(queue.filter(i => i.id !== id));
}

/** Limpa manualmente toda a fila (uso administrativo). */
export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

// ─── Core functions ──────────────────────────────────────────────

export interface DataCrazyLead {
  id: string;
  name: string;
  phone?: string;
  phones?: { phone: string }[];
  meta_lead_id?: string | null;
  tags?: { id: string; name: string }[];
  [key: string]: unknown;
}

export async function buscarLeadsComTagId(tagId: string): Promise<DataCrazyLead[]> {
  if (!tagId) {
    console.warn("No tag ID provided for lead search");
    return [];
  }

  // Usa o endpoint agregador do edge function: paginação e compactação
  // acontecem server-side, em paralelo. Uma única chamada em vez de 20+.
  const data = await api(
    "GET",
    `/leads/by-tag-compact?tagId=${encodeURIComponent(tagId)}`,
    undefined,
    { timeoutMs: 45_000, maxAttempts: 2 },
  );
  const items: DataCrazyLead[] = Array.isArray(data)
    ? (data as DataCrazyLead[])
    : ((data as { data?: DataCrazyLead[] })?.data ?? []);
  return items;
}

export interface LeadsPage {
  data: DataCrazyLead[];
  page: number;
  total: number | null;
  hasMore: boolean;
}

/** Busca UMA página (100 leads) da tag — carga incremental/background. */
export async function buscarLeadsPagina(tagId: string, page: number): Promise<LeadsPage> {
  if (!tagId) return { data: [], page, total: 0, hasMore: false };
  const res: any = await api(
    "GET",
    `/leads/by-tag-page?tagId=${encodeURIComponent(tagId)}&page=${page}`,
    undefined,
    { timeoutMs: 25_000, maxAttempts: 2 },
  );
  return {
    data: Array.isArray(res?.data) ? res.data : [],
    page,
    total: typeof res?.total === "number" ? res.total : null,
    hasMore: !!res?.hasMore,
  };
}

/**
 * Busca rápida por nome/telefone direto no CRM (dentro da tag).
 * Não passa pela fila serializada global — precisa responder em ~1s enquanto
 * a carga em background das páginas continua.
 */
export async function buscarLeadsPorTermo(tagId: string, q: string): Promise<DataCrazyLead[]> {
  const term = q.trim();
  if (!term) return [];
  const { data, error } = await supabase.functions.invoke("datacrazy-proxy", {
    body: {
      method: "GET",
      path: `/leads/search-compact?tagId=${encodeURIComponent(tagId)}&q=${encodeURIComponent(term)}`,
    },
  });
  if (error) throw new Error(`DataCrazy proxy error: ${error.message}`);
  if ((data as any)?.error) throw new Error(`DataCrazy API error: ${(data as any).error}`);
  return Array.isArray((data as any)?.data) ? ((data as any).data as DataCrazyLead[]) : [];
}


/** @deprecated Use buscarLeadsComTagId instead */
export async function buscarLeadsComTag(tagName: string): Promise<DataCrazyLead[]> {
  const tagsData = await api("GET", "/tags");
  const tags = Array.isArray(tagsData) ? tagsData : tagsData?.data || [];
  const targetTag = tags.find(
    (t: any) => t.name?.toLowerCase() === tagName.toLowerCase()
  );
  if (!targetTag) {
    console.warn(`Tag "${tagName}" not found in DataCrazy`);
    return [];
  }
  return buscarLeadsComTagId(targetTag.id);
}

export async function buscarLead(telefone: string): Promise<DataCrazyLead | null> {
  const data = await api("GET", `/leads?search=${encodeURIComponent(telefone)}`);
  const leads = data?.data || data || [];
  return leads.length > 0 ? leads[0] : null;
}

export async function buscarNegocioAtivo(leadId: string) {
  const pipelineId = await getStageId("datacrazy_pipeline_pre_vendas");
  const data = await api("GET", `/businesses?leadId=${leadId}`);
  const businesses = data?.data || data || [];
  return businesses.find(
    (b: any) => b.pipelineId === pipelineId && !b.deletedAt
  ) || null;
}

export async function criarNegocio(leadId: string, stageId: string, attendantId: string) {
  return api("POST", "/businesses", { leadId, stageId, attendantId });
}

export async function moverNegocio(businessId: string, stageId: string) {
  return api("POST", "/businesses/actions/move", {
    ids: [businessId],
    destinationStageId: stageId,
  });
}

export async function ganharNegocio(businessId: string) {
  return api("POST", "/businesses/actions/win", { ids: [businessId] });
}

export async function criarAtividade(
  leadId: string,
  attendantId: string,
  dados: {
    leadNome: string;
    closerNome: string;
    sdrNome: string;
    meetUrl: string;
    dataHoraISO: string;
    observacao?: string;
  },
  activityType: string = "Reunião"
) {
  const descParts = [
    `Closer: ${dados.closerNome}`,
    `SDR: ${dados.sdrNome}`,
    `Link Meet: ${dados.meetUrl}`,
  ];
  if (dados.observacao) {
    descParts.push(`\nObservações: ${dados.observacao}`);
  }

  return api("POST", `/leads/${leadId}/activities`, {
    type: activityType,
    title: `${activityType} — ${dados.leadNome}`,
    description: descParts.join("\n"),
    scheduledAt: dados.dataHoraISO,
    attendantId,
  });
}

export async function criarNota(leadId: string, content: string) {
  return api("POST", `/leads/${leadId}/notes`, {
    content,
  });
}

export async function removerTag(leadId: string, tagId: string) {
  return api("DELETE", `/leads/${leadId}/tags/${tagId}`);
}

// ─── Webhook (still through edge function) ───────────────────────

async function webhookPost(payload: Record<string, unknown>) {
  try {
    await retryWithBackoff(
      async () => {
        const { error } = await supabase.functions.invoke("datacrazy-webhook", { body: payload });
        if (error) {
          const wrapped = new Error(error.message) as Error & { status?: number };
          wrapped.status = (error as { status?: number }).status;
          throw wrapped;
        }
      },
      { label: "datacrazy-webhook" },
    );
  } catch (e) {
    console.warn("Webhook post failed:", e);
  }
}

// ─── Events ──────────────────────────────────────────────────────

export interface AgendamentoData {
  leadNome: string;
  leadTelefone: string;
  closerNome: string;
  closerId: string;
  sdrNome: string;
  sdrId: string;
  dataHoraISO: string;
  meetUrl: string;
  observacao?: string;
  meetingReason?: string | null;
}

export async function reuniaoAgendada(ag: AgendamentoData) {
  const stageId = await getStageId("datacrazy_stage_reuniao_agendada");
  const agObj = ag as unknown as Record<string, unknown>;

  // Resolve DataCrazy IDs from the database
  let closerDatacrazyId = ag.closerId;
  let sdrDatacrazyId = ag.sdrId;

  try {
    const { data: closerData } = await supabase.from("closers").select("datacrazy_id").eq("id", ag.closerId).maybeSingle();
    if (closerData?.datacrazy_id) closerDatacrazyId = closerData.datacrazy_id;

    const { data: profileData } = await supabase.from("profiles").select("datacrazy_id").eq("user_id", ag.sdrId).single();
    if (profileData?.datacrazy_id) sdrDatacrazyId = profileData.datacrazy_id;
  } catch {
    console.warn("Could not resolve DataCrazy IDs, using internal IDs");
  }

  // If no valid DataCrazy IDs, skip sync entirely to avoid "attendant not found" errors
  const hasValidCloserDcId = closerDatacrazyId !== ag.closerId;
  if (!hasValidCloserDcId) {
    console.warn("Closer does not have a datacrazy_id configured — skipping DataCrazy sync");
    return;
  }

  // Step 1: Find lead
  let lead: DataCrazyLead | null;
  try {
    lead = await buscarLead(ag.leadTelefone);
    if (!lead) { addToQueue("lead_nao_encontrado", 1, agObj); return; }
  } catch { addToQueue("reuniaoAgendada", 1, agObj); return; }

  // Step 2: Find or create business
  let negocio: any;
  try {
    negocio = await buscarNegocioAtivo(lead.id);
    if (!negocio) {
      negocio = await criarNegocio(lead.id, stageId, closerDatacrazyId);
    }
  } catch { addToQueue("reuniaoAgendada", 2, agObj); return; }

  // Step 3: Move business
  try {
    await moverNegocio(negocio.id, stageId);
  } catch { addToQueue("reuniaoAgendada", 3, agObj); return; }

  // Determine activity type based on meeting reason
  const activityType = ag.meetingReason || "Reunião";
  const isDefaultReuniao = !ag.meetingReason || ag.meetingReason === "Reunião";

  if (isDefaultReuniao) {
    // SDR-created meeting: create activity for both SDR and Closer
    // Step 4: Create activity for SDR
    try {
      await criarAtividade(lead.id, sdrDatacrazyId, ag, "Reunião");
    } catch { addToQueue("atividade_sdr", 4, agObj); }

    // Step 5: Create activity for Closer
    try {
      await criarAtividade(lead.id, closerDatacrazyId, ag, "Reunião");
    } catch { addToQueue("atividade_closer", 5, agObj); }
  } else {
    // Closer/Moderador/Admin-created meeting with specific reason
    // Create activity assigned to the creator (SDR field contains the creator)
    // Step 4: Create activity for the creator
    try {
      await criarAtividade(lead.id, sdrDatacrazyId, ag, activityType);
    } catch { addToQueue("atividade_creator", 4, agObj); }
  }

  // Step 5.5: Create note on lead with observation
  if (ag.observacao) {
    try {
      await criarNota(lead.id, ag.observacao);
    } catch { addToQueue("nota_lead", 5, agObj); }
  }

  // Step 6: Remove "agendamento" tag
  try {
    const tagAgendamento = lead.tags?.find(t => t.name.toLowerCase() === "agendamento");
    if (tagAgendamento) {
      await removerTag(lead.id, tagAgendamento.id);
    }
  } catch { addToQueue("reuniaoAgendada", 6, agObj); }

  // Step 7: Webhook
  try {
    await webhookPost({
      evento: "agendamento_criado",
      lead_nome: ag.leadNome,
      lead_telefone: ag.leadTelefone,
      closer_nome: ag.closerNome,
      data_hora: ag.dataHoraISO,
      meet_url: ag.meetUrl,
      sdr_responsavel: ag.sdrNome,
      status: "pendente",
    });
  } catch { addToQueue("reuniaoAgendada", 7, agObj); }
}

export async function reuniaoRealizada(ag: AgendamentoData) {
  const stageId = await getStageId("datacrazy_stage_reuniao_realizada");
  const agObj = ag as unknown as Record<string, unknown>;

  // Resolve DataCrazy ID for closer
  let closerDatacrazyId = ag.closerId;
  try {
    const { data: closerData } = await supabase.from("closers").select("datacrazy_id").eq("id", ag.closerId).maybeSingle();
    if (closerData?.datacrazy_id) closerDatacrazyId = closerData.datacrazy_id;
  } catch {
    console.warn("Could not resolve closer DataCrazy ID for reuniaoRealizada");
  }

  let lead: DataCrazyLead | null;
  try {
    lead = await buscarLead(ag.leadTelefone);
    if (!lead) { addToQueue("reuniaoRealizada", 1, agObj); return; }
  } catch { addToQueue("reuniaoRealizada", 1, agObj); return; }

  let negocio: any;
  try {
    negocio = await buscarNegocioAtivo(lead.id);
    if (!negocio) { addToQueue("reuniaoRealizada", 2, agObj); return; }
  } catch { addToQueue("reuniaoRealizada", 2, agObj); return; }

  try { await ganharNegocio(negocio.id); } catch { addToQueue("reuniaoRealizada", 3, agObj); return; }

  try {
    await criarNegocio(lead.id, stageId, closerDatacrazyId);
  } catch { addToQueue("reuniaoRealizada", 4, agObj); }

  try {
    await webhookPost({
      evento: "status_atualizado",
      pipeline_acao: "reuniao_realizada",
      lead_telefone: ag.leadTelefone,
      lead_nome: ag.leadNome,
      closer_nome: ag.closerNome,
      status_novo: "realizada",
      timestamp: new Date().toISOString(),
    });
  } catch { addToQueue("reuniaoRealizada", 5, agObj); }
}

export async function noShowOuCancelado(ag: AgendamentoData, status: "cancelada" | "no-show") {
  const stageId = await getStageId("datacrazy_stage_noshow_cancelado");
  const agObj = ag as unknown as Record<string, unknown>;

  let lead: DataCrazyLead | null;
  try {
    lead = await buscarLead(ag.leadTelefone);
    if (!lead) { addToQueue("noShowOuCancelado", 1, agObj); return; }
  } catch { addToQueue("noShowOuCancelado", 1, agObj); return; }

  let negocio: any;
  try {
    negocio = await buscarNegocioAtivo(lead.id);
    if (!negocio) { addToQueue("noShowOuCancelado", 2, agObj); return; }
  } catch { addToQueue("noShowOuCancelado", 2, agObj); return; }

  try { await moverNegocio(negocio.id, stageId); } catch { addToQueue("noShowOuCancelado", 3, agObj); return; }

  try {
    await webhookPost({
      evento: "status_atualizado",
      pipeline_acao: "no_show_ou_cancelado",
      lead_telefone: ag.leadTelefone,
      lead_nome: ag.leadNome,
      status_novo: status,
      timestamp: new Date().toISOString(),
    });
  } catch { addToQueue("noShowOuCancelado", 4, agObj); }
}

// ─── Retry system ────────────────────────────────────────────────

export async function processRetryQueue(): Promise<number> {
  const queue = getQueue();
  const remaining: QueueItem[] = [];

  for (const item of queue) {
    if (item.status === "falha_definitiva") {
      remaining.push(item);
      continue;
    }

    try {
      const ag = item.agendamento as unknown as AgendamentoData;
      if (item.tipo.startsWith("reuniaoAgendada") || item.tipo === "lead_nao_encontrado" || item.tipo === "atividade_sdr" || item.tipo === "atividade_closer") {
        await reuniaoAgendada(ag);
      } else if (item.tipo === "reuniaoRealizada") {
        await reuniaoRealizada(ag);
      } else if (item.tipo === "noShowOuCancelado") {
        await noShowOuCancelado(ag, (ag as any).status_novo || "cancelada");
      }
    } catch {
      item.tentativas += 1;
      if (item.tentativas >= 5) {
        item.status = "falha_definitiva";
      }
      remaining.push(item);
    }
  }

  setQueue(remaining);
  return remaining.filter(i => i.status === "pendente").length;
}
