import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAuthUrl } from "@/hooks/useGoogleCalendar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Shows a banner for closer users who haven't connected Google Calendar yet.
 * Only rendered for users with role "closer" or closers matching their email.
 */
export default function GoogleCalendarBanner() {
  const { user } = useAuth();
  const { getAuthUrl } = useGoogleAuthUrl();
  const [dismissed, setDismissed] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Check if current user's email matches a closer
  const { data: closerMatch } = useQuery({
    queryKey: ["closer-match", user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, email")
        .eq("email", user!.email!)
        .eq("active", true)
        .limit(1)
        .single();
      return data;
    },
  });

  // Check if closer has google tokens
  const { data: hasToken } = useQuery({
    queryKey: ["closer-has-google-token", closerMatch?.id],
    enabled: !!closerMatch?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_google_tokens")
        .select("id")
        .eq("closer_id", closerMatch!.id)
        .limit(1)
        .maybeSingle();
      // If no row found, data is null → return false
      // If row found, return true
      return !!data;
    },
    refetchInterval: 10_000, // Re-check every 10s after OAuth flow
  });

  // Only show for closers without token
  if (!closerMatch || hasToken || dismissed) return null;

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
        <strong>⚠ Sua agenda Google não está conectada.</strong>{" "}
        Conecte para que os SDRs vejam sua disponibilidade e criem eventos.
      </div>
      <Button
        size="sm"
        onClick={handleConnect}
        disabled={connecting}
        className="shrink-0 gap-2"
      >
        {connecting ? "Conectando..." : "Conectar Google Calendar"}
      </Button>
      <button onClick={() => setDismissed(true)} className="text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
