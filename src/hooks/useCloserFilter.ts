import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Closer {
  id: string;
  name: string;
  active: boolean;
}

function getStorageKey(userId: string) {
  return `closer-filter-${userId}`;
}

export function useCloserFilter() {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const { data: closers = [], isLoading } = useQuery({
    queryKey: ["closers-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name, active")
        .eq("active", true)
        .order("name");
      return (data ?? []) as Closer[];
    },
  });

  // Initialize from localStorage or select all
  useEffect(() => {
    if (!closers.length || initialized) return;
    const allIds = closers.map((c) => c.id);

    if (user) {
      try {
        const saved = localStorage.getItem(getStorageKey(user.id));
        if (saved) {
          const parsed: string[] = JSON.parse(saved);
          const valid = parsed.filter((id) => allIds.includes(id));
          if (valid.length > 0) {
            setSelectedIds(new Set(valid));
            setInitialized(true);
            return;
          }
        }
      } catch {}
    }

    setSelectedIds(new Set(allIds));
    setInitialized(true);
  }, [closers, user, initialized]);

  // Clean up selectedIds when closers list changes (e.g. closer deleted/deactivated)
  useEffect(() => {
    if (!initialized || !closers.length) return;
    const activeIds = new Set(closers.map((c) => c.id));
    setSelectedIds((prev) => {
      const cleaned = new Set([...prev].filter((id) => activeIds.has(id)));
      // If all were removed, select all active
      if (cleaned.size === 0) return activeIds;
      if (cleaned.size === prev.size) return prev; // no change
      return cleaned;
    });
  }, [closers, initialized]);

  // Persist to localStorage
  useEffect(() => {
    if (!user || !initialized) return;
    localStorage.setItem(getStorageKey(user.id), JSON.stringify([...selectedIds]));
  }, [selectedIds, user, initialized]);

  const toggle = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          if (next.size <= 1) return prev; // keep at least 1
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    []
  );

  return { closers, selectedIds, toggle, isLoading };
}
