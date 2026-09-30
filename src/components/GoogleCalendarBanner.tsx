import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAuthUrl } from "@/hooks/useGoogleCalendar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const MEET_SPACE_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
// Permissão que mantém o nome do lead no título da reunião do Meet
// (o sistema liga a gravação na sala criada pelo Google Calendar).
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";

// Closers no piloto do título com o nome do lead (espelha google-create-event).
const TITULO_PILOTO_CLOSER_IDS = new Set<string>([
  "1d5aeff3-87d8-46c3-bdfd-8f815f8f25ef", // Vitor Lima
]);

/**
 * Shows a banner for closer users who haven't connected Google Calendar yet.
 * Only rendered for users with role "closer" or closers matching their email.
 *
 * Também avisa o closer que já está no piloto de gravação automática
 * (`auto_recording_enabled = true`) mas cujo token não tem o escopo do Meet —
 * nesse caso ele precisa reautorizar uma vez para a gravação começar sozinha.
 */
export default function GoogleCalendarBanner() {
  const { user } = useAuth();
  const { getAuthUrl } = useGoogleAuthUrl();
  const queryClient = useQueryClient();

  const [connecting, setConnecting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Check if current user's email matches a closer
  const { data: closerMatch, isSuccess: closerChecked } = useQuery({
    queryKey: ["closer-match", user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, email, auto_recording_enabled")
        .eq("email", user!.email!)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return data as { id: string; email: string; auto_recording_enabled: boolean } | null;
    },
  });

  // Estado da conexão Google do closer.
  // staleTime 0 + refetchOnWindowFocus garante que, ao voltar do popup de OAuth,
  // o banner reflita imediatamente a conexão recém-criada.
  const {
    data: tokenInfo,
    isSuccess: tokenChecked,
    refetch: refetchToken,
    isFetching: tokenFetching,
  } = useQuery({
    queryKey: ["closer-has-google-token", closerMatch?.id],
    enabled: !!closerMatch?.id,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_google_tokens")
        .select("id, granted_scopes")
        .eq("closer_id", closerMatch!.id)
        .limit(1)
        .maybeSingle();
      // Não engolir erro: uma falha de permissão/rede não deve ser
      // interpretada como "closer sem conexão Google".
      if (error) throw error;
      const scopes =
        typeof (data as any)?.granted_scopes === "string"
          ? ((data as any).granted_scopes as string)
          : "";
      return {
        connected: !!data,
        hasMeetScope: scopes.includes(MEET_SPACE_SCOPE),
        hasSettingsScope: scopes.includes(MEET_SETTINGS_SCOPE),
      };
    },
  });

  // Limpa o polling ao desmontar
  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  // Só exibe quando ambas as verificações terminaram.
  if (!closerChecked || !closerMatch) return null;
  if (!tokenChecked || !tokenInfo) return null;

  // Piloto do nome do lead no título da reunião (mesma lista da função de criação).
  const noPilotoTitulo = TITULO_PILOTO_CLOSER_IDS.has(closerMatch.id);

  const needsRecordingScope =
    tokenInfo.connected &&
    closerMatch.auto_recording_enabled === true &&
    (!tokenInfo.hasMeetScope || (noPilotoTitulo && !tokenInfo.hasSettingsScope));

  if (tokenInfo.connected && !needsRecordingScope) return null;

  const escoposOk = (d?: { hasMeetScope?: boolean; hasSettingsScope?: boolean }) =>
    Boolean(d?.hasMeetScope) && (!noPilotoTitulo || Boolean(d?.hasSettingsScope));

  const startPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = window.setInterval(async () => {
      ticks += 1;
      const res = await refetchToken();
      const ok =
        res.data?.connected &&
        (!closerMatch.auto_recording_enabled || escoposOk(res.data));
      if (ok || ticks > 60) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setConnecting(false);
        if (ok) {
          queryClient.invalidateQueries({ queryKey: ["google-calendar-events"] });
          toast.success("Google conectado com sucesso.");
        }
      }
    }, 3000);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getAuthUrl(closerMatch.id);
      window.open(url, "_blank", "width=600,height=700");
      toast.info("Complete a autorização na janela aberta.");
      startPolling();
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar conexão com Google");
      setConnecting(false);
    }
  };

  const handleRecheck = async () => {
    const res = await refetchToken();
    if (res.error) {
      toast.error("Não foi possível verificar a conexão agora. Tente novamente em instantes.");
      return;
    }
    if (res.data?.connected && (!closerMatch.auto_recording_enabled || escoposOk(res.data))) {
      toast.success("Conexão confirmada.");
    } else {
      toast.info("Ainda não encontramos a autorização. Conclua o fluxo do Google.");
    }
  };


  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-[hsl(0_0%_20%)] px-4 py-3 text-sm">
      <AlertTriangle className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 text-foreground">
        {needsRecordingScope ? (
          <>
            <strong>⚠ Reautorize o Google para ativar a gravação automática.</strong>{" "}
            Sua agenda está conectada, mas falta a permissão de gravação/transcrição
            automática do Meet. Autorize uma vez e suas próximas reuniões começam a
            gravar sozinhas.
          </>
        ) : (
          <>
            <strong>⚠ Sua agenda Google não está conectada.</strong>{" "}
            Conecte para que os SDRs vejam sua disponibilidade e criem eventos.
          </>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRecheck}
        disabled={tokenFetching}
        className="shrink-0 gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${tokenFetching ? "animate-spin" : ""}`} />
        Já conectei
      </Button>
      <Button
        size="sm"
        onClick={handleConnect}
        disabled={connecting}
        className="shrink-0 gap-2"
      >
        {connecting
          ? "Conectando..."
          : needsRecordingScope
            ? "Reautorizar Google"
            : "Conectar Google Calendar"}
      </Button>
    </div>
  );
}
