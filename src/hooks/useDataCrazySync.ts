import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const QUEUE_KEY = "datacrazy_sync_queue";
const RETRY_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export interface DataCrazyPayload {
  evento: string;
  [key: string]: unknown;
}

interface QueueItem {
  id: string;
  payload: DataCrazyPayload;
  created_at: string;
  status: "pendente_sync";
}

function getQueue(): QueueItem[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setQueue(items: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function addToQueue(payload: DataCrazyPayload) {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    payload,
    created_at: new Date().toISOString(),
    status: "pendente_sync",
  });
  setQueue(queue);
}

async function sendToDataCrazy(payload: DataCrazyPayload): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("datacrazy-webhook", {
      body: payload,
    });

    if (error) throw error;
    return data?.success === true;
  } catch (err) {
    console.warn("DataCrazy send failed:", err);
    return false;
  }
}

export function useDataCrazySync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(() => {
    setPendingCount(getQueue().length);
  }, []);

  const processQueue = useCallback(async () => {
    const queue = getQueue();
    if (queue.length === 0) return;

    setSyncing(true);
    const remaining: QueueItem[] = [];

    for (const item of queue) {
      const success = await sendToDataCrazy(item.payload);
      if (!success) {
        remaining.push(item);
      }
    }

    setQueue(remaining);
    setPendingCount(remaining.length);
    setSyncing(false);
  }, []);

  // Auto-retry every 2 minutes
  useEffect(() => {
    refreshCount();
    intervalRef.current = setInterval(() => {
      processQueue();
    }, RETRY_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [processQueue, refreshCount]);

  const send = useCallback(
    async (payload: DataCrazyPayload) => {
      const success = await sendToDataCrazy(payload);
      if (!success) {
        addToQueue(payload);
        refreshCount();
      }
      return success;
    },
    [refreshCount]
  );

  return { send, pendingCount, syncing, syncNow: processQueue };
}

/** Helper to build a status update payload with pipeline actions */
export function buildStatusUpdatePayload({
  leadName,
  leadPhone,
  previousStatus,
  newStatus,
  updatedBy,
  closerName,
}: {
  leadName: string;
  leadPhone: string;
  previousStatus: string;
  newStatus: string;
  updatedBy: string;
  closerName?: string;
}): DataCrazyPayload {
  const base = {
    evento: "status_atualizado",
    lead_nome: leadName,
    lead_telefone: leadPhone,
    status_anterior: previousStatus,
    status_novo: newStatus,
    atualizado_por: updatedBy,
    timestamp: new Date().toISOString(),
  };

  // Reunião realizada → Pré-Vendas "Ganho" + Vendas "Reunião Realizada"
  if (newStatus === "realizada") {
    return {
      ...base,
      pipeline_acao: "reuniao_realizada",
      pipeline_pre_vendas: "pre-vendas",
      etapa_pre_vendas_destino: "Ganho",
      pipeline_vendas: "vendas",
      etapa_vendas_destino: "Reunião Realizada",
      closer_nome: closerName || "",
    };
  }

  // No-show ou Cancelada → Pré-Vendas "No-show/Cancelado"
  if (newStatus === "no-show" || newStatus === "cancelada") {
    return {
      ...base,
      pipeline_acao: "no_show_ou_cancelado",
      pipeline_origem: "pre-vendas",
      etapa_destino: "No-show/Cancelado",
    };
  }

  // Other status updates (confirmada, reagendada, etc.) — no pipeline action
  return base;
}
