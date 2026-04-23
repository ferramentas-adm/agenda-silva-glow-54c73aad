import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface OAuthErrorInfo {
  code: string;
  description: string;
  isMismatch: boolean;
  origin: string;
  expectedCallback: string;
  rawHash: string;
}

/**
 * Parses OAuth errors returned in the URL hash after an OAuth provider redirect.
 *
 * Examples handled:
 *  - #error=server_error&error_description=failed+to+check+consent+required
 *  - #error=redirect_uri_mismatch&error_description=...
 *  - #error=access_denied&error_description=...
 */
function parseOAuthHash(hash: string): OAuthErrorInfo | null {
  if (!hash || !hash.includes("error=")) return null;

  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error") ?? "";
  const description = (params.get("error_description") ?? "").replace(/\+/g, " ");

  // Heurística para detectar mismatch de redirect URI / domínio não autorizado:
  const lowered = `${code} ${description}`.toLowerCase();
  const isMismatch =
    lowered.includes("redirect_uri") ||
    lowered.includes("redirect uri") ||
    lowered.includes("consent required") ||
    lowered.includes("unauthorized") ||
    lowered.includes("invalid_client") ||
    lowered.includes("origin");

  const origin = window.location.origin;
  // Lovable Cloud OAuth callback (broker) — usado por lovable.auth.signInWithOAuth
  const expectedCallback = `${origin}/~oauth/callback`;

  return {
    code,
    description,
    isMismatch,
    origin,
    expectedCallback,
    rawHash: hash,
  };
}

export default function OAuthErrorDialog() {
  const [info, setInfo] = useState<OAuthErrorInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseOAuthHash(window.location.hash);
    if (parsed) {
      setInfo(parsed);
      // Limpa o hash da URL para não reabrir o diálogo em refresh
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const handleClose = () => setInfo(null);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (!info) return null;

  return (
    <Dialog open={!!info} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Falha no login com Google
          </DialogTitle>
          <DialogDescription>
            {info.isMismatch
              ? "O domínio atual não está autorizado nas credenciais do Google OAuth."
              : "O provedor retornou um erro durante o login."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Alert variant="destructive">
            <AlertTitle className="font-mono text-xs">{info.code}</AlertTitle>
            <AlertDescription className="text-xs">{info.description || "Sem detalhes"}</AlertDescription>
          </Alert>

          {info.isMismatch && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Para corrigir, verifique se as credenciais OAuth no Google Cloud Console
                contêm <strong>exatamente</strong> os valores abaixo:
              </p>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Authorized JavaScript Origin
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-background px-2 py-1.5 text-xs font-mono break-all">
                      {info.origin}
                    </code>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => copyToClipboard(info.origin, "Origin")}
                    >
                      {copied === "Origin" ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Authorized Redirect URI (callback)
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-background px-2 py-1.5 text-xs font-mono break-all">
                      {info.expectedCallback}
                    </code>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => copyToClipboard(info.expectedCallback, "Callback")}
                    >
                      {copied === "Callback" ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Alternativamente, remova o Client ID/Secret personalizados nas
                Configurações de Autenticação para usar o OAuth gerenciado, que já
                cobre todos os domínios deste projeto.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
