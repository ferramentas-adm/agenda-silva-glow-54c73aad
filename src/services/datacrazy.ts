/**
 * DataCrazy API Service Layer
 * All interactions with the DataCrazy API go through here.
 */

const API_URL = import.meta.env.VITE_DATACRAZY_API_URL || "https://api.g1.datacrazy.io/api/v1";
const API_TOKEN = import.meta.env.VITE_DATACRAZY_API_TOKEN || "";
const WEBHOOK_URL = import.meta.env.VITE_DATACRAZY_WEBHOOK_URL || "";

// Fallback stage/pipeline IDs from env
const STAGE_REUNIAO_AGENDADA = import.meta.env.VITE_DATACRAZY_STAGE_REUNIAO_AGENDADA || "";
const STAGE_REUNIAO_REALIZADA = import.meta.env.VITE_DATACRAZY_STAGE_REUNIAO_REALIZADA || "";
const STAGE_NOSHOW_CANCELADO = import.meta.env.VITE_DATACRAZY_STAGE_NOSHOW_CANCELADO || "";
const PIPELINE_PRE_VENDAS = import.meta.env.VITE_DATACRAZY_PIPELINE_PRE_VENDAS || "";
const PIPELINE_VENDAS = import.meta.env.VITE_DATACRAZY_PIPELINE_VENDAS || "";
const ACTIVITY_TYPE = import.meta.env.VITE_DATACRAZY_ACTIVITY_TYPE_REUNIAO || "Reunião";

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

// ─── HTTP helpers ────────────────────────────────────────────────

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: API_TOKEN,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataCrazy API [${res.status}]: ${text}`);
  }
  return res.json();
}

async function webhookPost(payload: Record<string, unknown>) {
  if (!WEBHOOK_URL) return;
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
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
  const data = await api("GET", `/leads?search=&filter=tags`);
  const leads: DataCrazyLead[] = data?.data || data || [];
  return leads.filter(
    (l) => l.tags?.some((t) => t.name.toLowerCase() === tagName.toLowerCase())
  );
}

export async function buscarLead(telefone: string): Promise<DataCrazyLead | null> {
  const data = await api("GET", `/leads?search=${encodeURIComponent(telefone)}`);
  const leads = data?.data || data || [];
  return leads.length > 0 ? leads[0] : null;
}

export async function buscarNegocioAtivo(leadId: string) {
  const data = await api("GET", `/businesses?leadId=${leadId}`);
  const businesses = data?.data || data || [];
  return businesses.find(
    (b: any) => b.pipelineId === PIPELINE_PRE_VENDAS && !b.deletedAt
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
  }
) {
  return api("POST", `/leads/${leadId}/activities`, {
    type: ACTIVITY_TYPE,
    title: `Diagnóstico Comercial — ${dados.leadNome}`,
    description: `Closer: ${dados.closerNome}\nSDR: ${dados.sdrNome}\nLink Meet: ${dados.meetUrl}`,
    scheduledAt: dados.dataHoraISO,
    attendantId,
  });
}

export async function removerTag(leadId: string, tagId: string) {
  return api("DELETE", `/leads/${leadId}/tags/${tagId}`);
}

// ─── Pipeline config (dynamic fetch with env fallback) ───────────

interface PipelineConfig {
  stageReuniaoAgendada: string;
  stageReuniaoRealizada: string;
  stageNoShowCancelado: string;
  pipelinePreVendas: string;
  pipelineVendas: string;
}

let cachedConfig: PipelineConfig | null = null;

export async function getPipelineConfig(): Promise<PipelineConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const data = await api("GET", "/pipelines");
    // Try to match pipelines — this is a best-effort approach
    // The admin can set exact IDs in app_settings
    console.log("DataCrazy pipelines loaded:", data);
  } catch (e) {
    console.warn("Failed to fetch DataCrazy pipelines, using env fallback:", e);
  }

  cachedConfig = {
    stageReuniaoAgendada: STAGE_REUNIAO_AGENDADA,
    stageReuniaoRealizada: STAGE_REUNIAO_REALIZADA,
    stageNoShowCancelado: STAGE_NOSHOW_CANCELADO,
    pipelinePreVendas: PIPELINE_PRE_VENDAS,
    pipelineVendas: PIPELINE_VENDAS,
  };

  return cachedConfig;
}

export function updatePipelineConfig(config: Partial<PipelineConfig>) {
  cachedConfig = { ...(cachedConfig || {
    stageReuniaoAgendada: STAGE_REUNIAO_AGENDADA,
    stageReuniaoRealizada: STAGE_REUNIAO_REALIZADA,
    stageNoShowCancelado: STAGE_NOSHOW_CANCELADO,
    pipelinePreVendas: PIPELINE_PRE_VENDAS,
    pipelineVendas: PIPELINE_VENDAS,
  }), ...config };
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
}

export async function reuniaoAgendada(ag: AgendamentoData) {
  const config = await getPipelineConfig();
  const agObj = ag as unknown as Record<string, unknown>;

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
      negocio = await criarNegocio(lead.id, config.stageReuniaoAgendada, ag.closerId);
    }
  } catch { addToQueue("reuniaoAgendada", 2, agObj); return; }

  // Step 3: Move business
  try {
    await moverNegocio(negocio.id, config.stageReuniaoAgendada);
  } catch { addToQueue("reuniaoAgendada", 3, agObj); return; }

  // Step 4: Create activity for SDR (don't block on failure)
  try {
    await criarAtividade(lead.id, ag.sdrId, ag);
  } catch { addToQueue("atividade_sdr", 4, agObj); }

  // Step 5: Create activity for Closer (don't block on failure)
  try {
    await criarAtividade(lead.id, ag.closerId, ag);
  } catch { addToQueue("atividade_closer", 5, agObj); }

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
  const config = await getPipelineConfig();
  const agObj = ag as unknown as Record<string, unknown>;

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
    await criarNegocio(lead.id, config.stageReuniaoRealizada, ag.closerId);
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
  const config = await getPipelineConfig();
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

  try { await moverNegocio(negocio.id, config.stageNoShowCancelado); } catch { addToQueue("noShowOuCancelado", 3, agObj); return; }

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
      // Re-run the event based on type
      const ag = item.agendamento as unknown as AgendamentoData;
      if (item.tipo.startsWith("reuniaoAgendada") || item.tipo === "lead_nao_encontrado" || item.tipo === "atividade_sdr" || item.tipo === "atividade_closer") {
        await reuniaoAgendada(ag);
      } else if (item.tipo === "reuniaoRealizada") {
        await reuniaoRealizada(ag);
      } else if (item.tipo === "noShowOuCancelado") {
        await noShowOuCancelado(ag, (ag as any).status_novo || "cancelada");
      }
      // If we get here without error, it was re-queued or succeeded — don't re-add
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
