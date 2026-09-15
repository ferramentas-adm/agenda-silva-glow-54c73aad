import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { FunilFilterValue } from "@/lib/funilDiretor";

interface Closer {
  id: string;
  name: string;
  active: boolean;
  email: string | null;
  em_treinamento?: boolean | null;
}

export type TurmaFilterValue = "todos" | "a" | "b";

function getStorageKey(userId: string) {
  return `closer-filter-${userId}`;
}

function getTurmaStorageKey(userId: string) {
  return `closer-turma-${userId}`;
}

function getFunilStorageKey(userId: string) {
  return `closer-funil-${userId}`;
}

export function useCloserFilter() {
  const { user, role } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [turma, setTurmaState] = useState<TurmaFilterValue>("todos");
  const [funil, setFunilState] = useState<FunilFilterValue>("todos");
  const lastReconciledRef = useRef("");

  const { data: closers = [], isLoading } = useQuery({
    queryKey: ["closers-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name, active, email, em_treinamento")
        .eq("active", true)
        .order("name");
      return (data ?? []) as Closer[];
    },
  });

  // Turma persistida por usuário
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(getTurmaStorageKey(user.id));
      if (saved === "a" || saved === "b" || saved === "todos") setTurmaState(saved);
    } catch {}
  }, [user?.id]);

  const setTurma = useCallback(
    (v: TurmaFilterValue) => {
      setTurmaState(v);
      if (user) {
        try {
          localStorage.setItem(getTurmaStorageKey(user.id), v);
        } catch {}
      }
    },
    [user?.id]
  );

  // Funil persistido por usuário
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(getFunilStorageKey(user.id));
      if (saved === "diretor" || saved === "padrao" || saved === "todos") setFunilState(saved);
    } catch {}
  }, [user?.id]);

  const setFunil = useCallback(
    (v: FunilFilterValue) => {
      setFunilState(v);
      if (user) {
        try {
          localStorage.setItem(getFunilStorageKey(user.id), v);
        } catch {}
      }
    },
    [user?.id]
  );

  // Initialize from localStorage or select all (closers only see their own)
  useEffect(() => {
    if (initialized || !user || role === null) return;
    // Espera a lista de closers carregar de verdade — inicializar com lista vazia
    // deixava a seleção vazia ("Selecione ao menos um closer...") até um reload.
    if (isLoading || closers.length === 0) return;
    const allIds = closers.map((c) => c.id);

    // Closers can only see their own calendar
    if (role === "closer") {
      if (!user.email) return;
      const myCloser = closers.find((c) => c.email?.toLowerCase() === user.email!.toLowerCase());
      if (!myCloser) return; // tenta de novo quando a lista atualizar
      setSelectedIds(new Set([myCloser.id]));
      setInitialized(true);
      return;
    }

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

    setSelectedIds(new Set(allIds));
    setInitialized(true);
  }, [closers, user, initialized, role, isLoading]);

  // Sync selectedIds com a lista de closers ativos:
  //  - remove ids que ficaram inativos/deletados
  //  - ADICIONA closers novos que ainda não estavam na seleção salva
  // Sem isso, agendas (incluindo "confirmadas") de closers adicionados
  // depois da última seleção ficavam invisíveis na Dashboard.
  useEffect(() => {
    if (!initialized || !closers.length) return;
    if (role === "closer") {
      if (!user?.email) return;
      setSelectedIds((prev) => {
        if (prev.size > 0) return prev;
        const myCloser = closers.find((c) => c.email?.toLowerCase() === user.email!.toLowerCase());
        return myCloser ? new Set([myCloser.id]) : prev;
      });
      return;
    }
    const activeIds = closers.map((c) => c.id);
    const signature = [...activeIds].sort().join(",");
    if (lastReconciledRef.current === signature) return;
    const isFirstRun = lastReconciledRef.current === "";
    lastReconciledRef.current = signature;
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => activeIds.includes(id)));
      let changed = next.size !== prev.size;
      // Closers novos entram na visualização só quando a lista realmente muda.
      if (!isFirstRun) {
        for (const id of activeIds) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
      }
      if (next.size === 0) return new Set(activeIds);
      return changed ? next : prev;
    });
  }, [closers, initialized, role, user?.email]);



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
    if (turma === "a") return closers.filter((c) => !c.em_treinamento);
    if (turma === "b") return closers.filter((c) => !!c.em_treinamento);
    return closers;
  }, [closers, isCloserRole, user?.email, turma]);

  const countTurmaA = useMemo(() => closers.filter((c) => !c.em_treinamento).length, [closers]);
  const countTurmaB = useMemo(() => closers.filter((c) => !!c.em_treinamento).length, [closers]);

  // Interseção entre a seleção do usuário e os closers visíveis na turma atual —
  // preserva a seleção ao alternar entre turmas.
  const effectiveSelectedIds = useMemo(() => {
    const visible = new Set(visibleClosers.map((c) => c.id));
    return new Set([...selectedIds].filter((id) => visible.has(id)));
  }, [visibleClosers, selectedIds]);

  return {
    closers: visibleClosers,
    selectedIds,
    effectiveSelectedIds,
    toggle,
    isLoading: isLoading || !initialized,
    isCloserRole,
    turma,
    setTurma,
    countTurmaA,
    countTurmaB,
    funil,
    setFunil,
  };
}
