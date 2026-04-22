import { Bell, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications, type Notification } from "@/hooks/useNotifications";

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const handleClick = (n: Notification) => {
    if (!n.read_at) markAsRead(n.id);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-[hsl(0_0%_100%/0.06)] hover:text-foreground transition-colors"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notificações</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => markAllAsRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma notificação
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      !n.read_at && "bg-primary/5"
                    )}
                  >
                    <div className="flex w-full items-start gap-2">
                      {!n.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold leading-tight">{n.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
