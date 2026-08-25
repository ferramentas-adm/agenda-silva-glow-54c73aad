import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAuthUrl } from "@/hooks/useGoogleCalendar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const MEET_SPACE_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";

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

  
  const [connecting, setConnecting] = useState(false);

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

  // Check if closer has google tokens
  // C1: sem polling de 5s — atualizamos por window focus (abaixo) e
  // invalidação manual após o callback do OAuth.
  const { data: tokenInfo, isSuccess: tokenChecked } = useQuery({
    queryKey: ["closer-has-google-token", closerMatch?.id],
    enabled: !!closerMatch?.id,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await supabase
        .from("closer_google_tokens")
        .select("id, granted_scopes")
        .eq("closer_id", closerMatch!.id)
        .limit(1)
        .maybeSingle();
      return {
        connected: !!data,
        hasMeetScope:
          typeof (data as any)?.granted_scopes === "string" &&
          (data as any).granted_scopes.includes(MEET_SPACE_SCOPE),
      };
    },
  });

  // Sem listener de `focus`: o `refetchOnWindowFocus` da query acima já cobre o
  // retorno do popup de OAuth, respeitando o staleTime de 5 min.

  // Só exibe quando ambas as verificações terminaram.
  if (!closerChecked || !closerMatch) return null;
  if (!tokenChecked || !tokenInfo) return null;

  const needsRecordingScope =
    tokenInfo.connected &&
    closerMatch.auto_recording_enabled === true &&
    !tokenInfo.hasMeetScope;

  if (tokenInfo.connected && !needsRecordingScope) return null;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getAuthUrl(closerMatch.id);
      window.open(url, "_blank", "width=600,height=700");
      toast.info("Complete a autorização na janela aberta.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar conexão com Google");
    }
    setConnecting(false);
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
