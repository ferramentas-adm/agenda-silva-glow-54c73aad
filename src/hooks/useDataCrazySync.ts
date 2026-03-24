import { useState, useEffect, useCallback, useRef } from "react";
import {
  getPendingQueue,
  getAllQueue,
  processRetryQueue,
  markResolved,
  type QueueItem,
} from "@/services/datacrazy";

const RETRY_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export function useDataCrazySync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(() => {
    setPendingCount(getPendingQueue().length);
  }, []);

  const processQueue = useCallback(async () => {
    setSyncing(true);
    const remaining = await processRetryQueue();
    setPendingCount(remaining);
    setSyncing(false);
  }, []);

  useEffect(() => {
    refreshCount();
    intervalRef.current = setInterval(() => {
      processQueue();
    }, RETRY_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [processQueue, refreshCount]);

  return {
    pendingCount,
    syncing,
    syncNow: processQueue,
    refreshCount,
    getQueue: getAllQueue,
    markResolved: (id: string) => { markResolved(id); refreshCount(); },
  };
}
