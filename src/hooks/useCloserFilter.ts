import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Closer {
  id: string;
  name: string;
  active: boolean;
  email: string | null;
}

function getStorageKey(userId: string) {
  return `closer-filter-${userId}`;
}

export function useCloserFilter() {
  const { user, role } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const { data: closers = [], isLoading } = useQuery({
    queryKey: ["closers-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name, active, email")
        .eq("active", true)
        .order("name");
      return (data ?? []) as Closer[];
    },
  });

  // Initialize from localStorage or select all (closers only see their own)
  useEffect(() => {
    if (initialized || !user || role === null || isLoading) return;
    // Query settled with empty result (e.g. 406 or no active closers) — unblock rendering
    if (!closers.length) {
      setInitialized(true);
      return;
    }
    const allIds = closers.map((c) => c.id);

    // Closers can only see their own calendar
    if (role === "closer" && user?.email) {
      const myCloser = closers.find((c) => c.email?.toLowerCase() === user.email!.toLowerCase());
      if (myCloser) {
        setSelectedIds(new Set([myCloser.id]));
        setInitialized(true);
        return;
      }
    }

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
  }, [closers, isLoading, user, initialized, role]);

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

  const isCloserRole = role === "closer";

  // For closer role, only return their own closer in the list
  const visibleClosers = useMemo(() => {
    if (isCloserRole && user?.email) {
      return closers.filter((c) => c.email?.toLowerCase() === user.email!.toLowerCase());
    }
    return closers;
  }, [closers, isCloserRole, user?.email]);

  return { closers: visibleClosers, selectedIds, toggle, isLoading: isLoading || !initialized, isCloserRole };
}
