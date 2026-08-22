/**
 * Store em memória (+ cache em localStorage) do banco de leads com a tag
 * "agendamento". Carrega as páginas em BACKGROUND e notifica os assinantes a
 * cada página recebida, para a UI ficar utilizável imediatamente.
 */
import { buscarLeadsPagina, type DataCrazyLead } from "@/services/datacrazy";

export interface StoreLead {
  id: string;
  name: string;
  phone: string;
  meta_lead_id?: string | null;
  tags?: { id: string; name: string }[];
}

interface State {
  leads: StoreLead[];
  total: number | null;
  loading: boolean;
  done: boolean;
  error: Error | null;
  updatedAt: number | null;
}

const CACHE_PREFIX = "dc_leads_v1_";
const CACHE_TTL_MS = 10 * 60_000;
const CONCURRENCY = 3;
const MAX_PAGES = 60;

const state: State = {
  leads: [],
  total: null,
  loading: false,
  done: false,
  error: null,
  updatedAt: null,
};

let currentTagId: string | null = null;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getSnapshot(): State {
  return state;
}

function mapLead(l: DataCrazyLead): StoreLead {
  const phone = l.phone || (Array.isArray(l.phones) && l.phones[0]?.phone) || "";
  return {
    id: l.id,
    name: l.name,
    phone: typeof phone === "string" ? phone : String(phone),
    meta_lead_id: l.meta_lead_id,
    tags: l.tags,
  };
}

function readCache(tagId: string): { leads: StoreLead[]; updatedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + tagId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { leads: StoreLead[]; updatedAt: number };
    if (!Array.isArray(parsed?.leads) || !parsed.updatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(tagId: string, leads: StoreLead[]) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + tagId,
      JSON.stringify({ leads, updatedAt: Date.now() }),
    );
  } catch {
    /* quota — ignora */
  }
}

/** Mescla leads por id, preservando ordem de chegada. */
export function mergeLeads(base: StoreLead[], extra: StoreLead[]): StoreLead[] {
  if (extra.length === 0) return base;
  const seen = new Set(base.map((l) => l.id));
  const out = [...base];
  for (const l of extra) {
    if (!l?.id || seen.has(l.id)) continue;
    seen.add(l.id);
    out.push(l);
  }
  return out;
}

/**
 * Inicia (ou reaproveita) a carga em background.
 * `force` ignora o cache e recarrega tudo.
 */
export function ensureLeads(tagId: string, force = false): Promise<void> {
  if (!tagId) return Promise.resolve();

  if (currentTagId !== tagId) {
    currentTagId = tagId;
    state.leads = [];
    state.total = null;
    state.done = false;
    state.error = null;
    state.updatedAt = null;
    loadPromise = null;
  }

  if (!force) {
    if (loadPromise) return loadPromise;
    if (state.updatedAt && Date.now() - state.updatedAt < CACHE_TTL_MS && state.done) {
      return Promise.resolve();
    }
    // Semeia com o cache do navegador para a UI abrir instantaneamente.
    if (state.leads.length === 0) {
      const cached = readCache(tagId);
      if (cached) {
        state.leads = cached.leads;
        state.total = cached.leads.length;
        state.updatedAt = cached.updatedAt;
        emit();
      }
    }
  } else {
    loadPromise = null;
  }

  state.loading = true;
  state.error = null;
  emit();

  loadPromise = (async () => {
    try {
      const first = await buscarLeadsPagina(tagId, 0);
      let acc = first.data.map(mapLead);
      state.leads = force ? acc : mergeLeads(acc, state.leads);
      state.total = first.total ?? null;
      state.done = !first.hasMore;
      emit();

      if (first.hasMore) {
        const totalPages = first.total
          ? Math.min(Math.ceil(first.total / 100), MAX_PAGES)
          : MAX_PAGES;
        let stop = false;
        for (let p = 1; p < totalPages && !stop; p += CONCURRENCY) {
          const batch: number[] = [];
          for (let k = 0; k < CONCURRENCY && p + k < totalPages; k++) batch.push(p + k);
          const results = await Promise.all(
            batch.map((page) =>
              buscarLeadsPagina(tagId, page).catch(() => ({
                data: [],
                page,
                total: null,
                hasMore: false,
              })),
            ),
          );
          for (const r of results) {
            if (r.data.length === 0) {
              stop = true;
              continue;
            }
            acc = mergeLeads(acc, r.data.map(mapLead));
            if (!r.hasMore) stop = true;
          }
          state.leads = acc;
          emit();
        }
        state.done = true;
      }

      state.updatedAt = Date.now();
      writeCache(tagId, state.leads);
    } catch (err) {
      state.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      state.loading = false;
      loadPromise = null;
      emit();
    }
  })();

  return loadPromise;
}
