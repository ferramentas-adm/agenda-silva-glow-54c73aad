import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataCrazySyncIndicatorProps {
  pendingCount: number;
  syncing: boolean;
  onSyncNow: () => void;
}

export default function DataCrazySyncIndicator({
  pendingCount,
  syncing,
  onSyncNow,
}: DataCrazySyncIndicatorProps) {
  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-50 dark:bg-orange-950/20 px-3 py-2 text-sm">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
      </span>
      <span className="text-orange-700 dark:text-orange-300">
        {pendingCount} item{pendingCount > 1 ? "s" : ""} aguardando sincronização com DataCrazy
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSyncNow}
        disabled={syncing}
        className={cn(
          "ml-auto h-7 gap-1.5 text-xs text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30",
          syncing && "animate-spin-slow"
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
        {syncing ? "Sincronizando…" : "Sincronizar agora"}
      </Button>
    </div>
  );
}
