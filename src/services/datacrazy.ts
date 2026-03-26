/**
 * DataCrazy API Service Layer
 * All interactions with the DataCrazy API go through the edge function proxy.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Proxy helper ────────────────────────────────────────────────

async function api(method: string, path: string, payload?: unknown) {
  const { data, error } = await supabase.functions.invoke("datacrazy-proxy", {
    body: { method, path, payload },
  });

  if (error) throw new Error(`DataCrazy proxy error: ${error.message}`);
  if (data?.error) throw new Error(`DataCrazy API error: ${data.error}`);
  return data;
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

const QUEUE_KEY = "datacrazy_sync_queue";

export interface QueueItem {
  id: string;
  tipo: string;
  passo_falhou: number;
  agendamento: Record<string, unknown>;
  tentativas: number;
  criado_em: string;
  status: "pendente" | "falha_definitiva";
}

function getQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; }
}

function setQueue(items: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
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

// ─── Core functions ──────────────────────────────────────────────

export interface DataCrazyLead {
  id: string;
  name: string;
  phone?: string;
  phones?: { phone: string }[];
  tags?: { id: string; name: string }[];
  [key: string]: unknown;
}

export async function buscarLeadsComTag(tagName: string): Promise<DataCrazyLead[]> {
  // Step 1: Fetch all tags to find the ID of the target tag
  const tagsData = await api("GET", "/tags");
  const tags = Array.isArray(tagsData) ? tagsData : tagsData?.data || [];
  const targetTag = tags.find(
    (t: any) => t.name?.toLowerCase() === tagName.toLowerCase()
  );

  if (!targetTag) {
    console.warn(`Tag "${tagName}" not found in DataCrazy`);
    return [];
  }

  // Step 2: Use filter[tags]=<tagId> to fetch only leads with this tag
  const data = await api("GET", `/leads?filter[tags]=${targetTag.id}`);
  const leads: DataCrazyLead[] = data?.data || data || [];
  return leads;
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
    await supabase.functions.invoke("datacrazy-webhook", { body: payload });
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
    const { data: closerData } = await supabase.from("closers").select("datacrazy_id").eq("id", ag.closerId).single();
    if (closerData?.datacrazy_id) closerDatacrazyId = closerData.datacrazy_id;

    const { data: profileData } = await supabase.from("profiles").select("datacrazy_id").eq("user_id", ag.sdrId).single();
    if (profileData?.datacrazy_id) sdrDatacrazyId = profileData.datacrazy_id;
  } catch {
    console.warn("Could not resolve DataCrazy IDs, using internal IDs");
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

  // Step 4: Create activity for SDR
  try {
    await criarAtividade(lead.id, sdrDatacrazyId, ag);
  } catch { addToQueue("atividade_sdr", 4, agObj); }

  // Step 5: Create activity for Closer
  try {
    await criarAtividade(lead.id, closerDatacrazyId, ag);
  } catch { addToQueue("atividade_closer", 5, agObj); }

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
    const { data: closerData } = await supabase.from("closers").select("datacrazy_id").eq("id", ag.closerId).single();
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
