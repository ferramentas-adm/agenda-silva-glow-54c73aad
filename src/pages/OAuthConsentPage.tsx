import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

// Consent page for the app's MCP OAuth server. Supabase Auth redirects
// unauthenticated users here after login; approving/denying finalizes the
// authorization on the auth server.
type AuthOAuth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const oauth = (supabase.auth as unknown as { oauth: AuthOAuth }).oauth;

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Parâmetro authorization_id ausente.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md w-full glass-card-intense rounded-2xl p-8 text-center">
          <h1 className="font-display text-lg font-semibold mb-2">Não foi possível carregar</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const clientName = details.client?.name ?? "um aplicativo";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md w-full glass-card-intense rounded-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="font-display text-xl font-semibold glow-text">
            Conectar {clientName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} quer acessar o painel de agendamentos usando a sua conta.
            As ferramentas rodarão com as suas permissões.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => decide(true)} disabled={busy} className="w-full">
            {busy ? <Loader2 className="animate-spin" /> : "Aprovar"}
          </Button>
          <Button
            onClick={() => decide(false)}
            disabled={busy}
            variant="outline"
            className="w-full"
          >
            Negar
          </Button>
        </div>
      </div>
    </main>
  );
}
