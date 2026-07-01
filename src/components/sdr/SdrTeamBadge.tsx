import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SdrTeam = "trafego" | "social_selling";

export const SDR_TEAM_LABELS: Record<SdrTeam, string> = {
  trafego: "Tráfego",
  social_selling: "Social Selling",
};

const CLASSES: Record<SdrTeam, string> = {
  trafego: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  social_selling: "border-violet-500/40 bg-violet-500/10 text-violet-400",
};

export function SdrTeamBadge({
  team,
  className,
  showEmptyState = false,
}: {
  team: SdrTeam | null | undefined;
  className?: string;
  showEmptyState?: boolean;
}) {
  if (!team) {
    if (!showEmptyState) return null;
    return (
      <Badge
        variant="outline"
        className={cn("text-[10px] border-dashed border-muted-foreground/40 text-muted-foreground", className)}
      >
        Sem time
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", CLASSES[team], className)}>
      {SDR_TEAM_LABELS[team]}
    </Badge>
  );
}
