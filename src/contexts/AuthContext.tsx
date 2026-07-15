import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/services/auditLog";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "sdr" | "gestor" | "closer" | "moderador" | "supervisor" | "apresentador";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isGestor: boolean;
  isModerador: boolean;
  isSupervisor: boolean;
  isApresentador: boolean;
  clearMustChangePassword: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const fetchUserData = async (userId: string) => {
    // Paraleliza role + profile em uma única rodada de requests
    const [roleRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("must_change_password").eq("user_id", userId).maybeSingle(),
    ]);
    setRole((roleRes.data?.role as AppRole) ?? null);
    setMustChangePassword(profileRes.data?.must_change_password ?? false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const isOAuth = session.user.app_metadata?.provider && session.user.app_metadata.provider !== "email";
          if (isOAuth) {
            // Para OAuth: já busca profile completo (validação + must_change_password) e role em paralelo
            const [profileRes, roleRes] = await Promise.all([
              supabase
                .from("profiles")
                .select("user_id, must_change_password")
                .eq("email", session.user.email ?? "")
                .maybeSingle(),
              supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", session.user.id)
                .maybeSingle(),
            ]);

            if (!profileRes.data) {
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setRole(null);
              setLoading(false);
              window.dispatchEvent(new CustomEvent("auth-blocked", { detail: "Acesso negado. Seu e-mail não está cadastrado no sistema." }));
              return;
            }

            setRole((roleRes.data?.role as AppRole) ?? null);
            setMustChangePassword(profileRes.data.must_change_password ?? false);
          } else {
            // Login com email/senha — paraleliza role + profile
            fetchUserData(session.user.id);
          }
          if (event === "SIGNED_IN") {
            const provider = session.user.app_metadata?.provider || "email";
            logAudit("login", "user", session.user.id, { email: session.user.email, provider });
          }
        } else {
          setRole(null);
          setMustChangePassword(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setMustChangePassword(false);
    // Evita vazar dados em cache entre contas na mesma aba.
    queryClient.clear();
  };

  const clearMustChangePassword = () => setMustChangePassword(false);

  return (
    <AuthContext.Provider value={{
      user, session, role, loading, mustChangePassword,
      signIn, signOut, isGestor: role === "gestor", isModerador: (role === "moderador" || role === "apresentador"), isSupervisor: role === "supervisor", isApresentador: role === "apresentador", clearMustChangePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
