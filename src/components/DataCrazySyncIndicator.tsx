import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getAllQueue, markResolved, type QueueItem } from "@/services/datacrazy";

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
  const [modalOpen, setModalOpen] = useState(false);

  if (pendingCount === 0) return null;

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-orange-400/30 bg-orange-50 dark:bg-orange-950/20 px-3 py-2 text-sm text-left"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
        </span>
        <span className="text-orange-700 dark:text-orange-300 flex-1">
          {pendingCount} agendamento{pendingCount > 1 ? "s" : ""} aguardando sync
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onSyncNow(); }}
          disabled={syncing}
          className={cn(
            "ml-auto h-7 gap-1.5 text-xs text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Sincronizando…" : "Sincronizar agora"}
        </Button>
      </button>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fila de Sincronização DataCrazy</DialogTitle>
          </DialogHeader>
          <QueueList onSync={onSyncNow} syncing={syncing} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function QueueList({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  const items = getAllQueue();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Fila vazia.</p>;
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm",
            item.status === "falha_definitiva"
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-secondary/50"
          )}
        >
          <div className="min-w-0">
            <p className="font-medium text-xs truncate">{item.tipo}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(item.criado_em).toLocaleString("pt-BR")} · {item.tentativas} tentativas
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {item.status === "falha_definitiva" ? (
              <Button
                variant="ghost" size="sm" className="h-6 text-[10px]"
                onClick={() => { markResolved(item.id); onSync(); }}
              >
                Resolver
              </Button>
            ) : (
              <Button
                variant="ghost" size="sm" className="h-6 text-[10px]"
                onClick={onSync}
                disabled={syncing}
              >
                <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
