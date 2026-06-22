import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Settings, LogOut, Menu, X, ScrollText, CalendarOff, List, Sun, Moon, BarChart3, CalendarClock, Wallet, Users, UserPlus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useState, useRef, useCallback, useEffect } from "react";
import { buscarLeadsComTagId } from "@/services/datacrazy";
import logo from "@/assets/logo.png";
import { tenantConfig } from "@/config/tenant";
import GoogleCalendarBanner from "@/components/GoogleCalendarBanner";
import CloserBlockDialog from "@/components/CloserBlockDialog";
import NotificationBell from "@/components/NotificationBell";
import PendingMeetingsBanner from "@/components/PendingMeetingsBanner";
import OverdueFollowUpsBanner from "@/components/OverdueFollowUpsBanner";
import OverdueMeetingsLockOverlay from "@/components/OverdueMeetingsLockOverlay";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/hooks/useTheme";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, isGestor } = useAuth();
  const isModerador = role === "moderador";
  const location = useLocation();
  const queryClient = useQueryClient();
  const [blocksOpen, setBlocksOpen] = useState(false);

  // Warm-up + prefetch da lista de leads do DataCrazy assim que o app carrega
  // (evita cold-start da edge function e ~10s no primeiro acesso a /agendar).
  useEffect(() => {
    if (!user) return;
    const tagId = (import.meta.env.VITE_DATACRAZY_TAG_AGENDAMENTO as string) || "";
    if (!tagId) return;
    queryClient.prefetchQuery({
      queryKey: ["datacrazy-leads-agendamento", tagId],
      queryFn: async () => {
        const dcLeads = await buscarLeadsComTagId(tagId);
        return dcLeads.map((l: any) => ({
          id: l.id,
          name: l.name,
          phone: l.phone || (l.phones && l.phones[0]?.phone) || "",
          dataCrazyId: l.id,
          tags: l.tags,
        }));
      },
      staleTime: 5 * 60_000,
    });
  }, [user, queryClient]);

  // Sidebar hover-expand state
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCloser = role === "closer";
  const { theme, toggleTheme } = useTheme();

  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    setExpanded(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => setExpanded(false), 500);
  }, []);

  useEffect(() => {
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, []);

  // Fetch closer record (apenas para saber se o usuário tem registro de closer)
  const { data: closerRecord } = useQuery({
    queryKey: ["my-closer-record", user?.email],
    enabled: isCloser && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id").eq("email", user!.email!).maybeSingle();
      return data;
    },
  });

  const { can } = usePermissions();

  // Fila de reuniões aguardando atribuição de Closer (badge no menu lateral).
  const { data: pendingAssignmentCount = 0 } = useQuery({
    queryKey: ["pending-closer-assignment-count"],
    enabled: can("assign_closer"),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .is("closer_id", null)
        .is("deleted_at", null)
        .neq("status", "cancelada");
      return count ?? 0;
    },
  });

  const navItems = [
    ...(can("view_calendar") ? [{ to: "/", label: "Calendário", icon: CalendarDays, badge: 0 }] : []),
    ...(can("assign_closer") ? [{ to: "/aguardando-atribuicao", label: "Aguardando atribuição", icon: UserPlus, badge: pendingAssignmentCount }] : []),
    ...(can("view_meetings") ? [{ to: "/reunioes", label: "Reuniões", icon: List, badge: 0 }] : []),
    ...(can("view_follow_ups") ? [{ to: "/follow-ups", label: "Follow-ups", icon: CalendarClock, badge: 0 }] : []),
    ...(isCloser ? [{ to: "/meus-follows", label: "Meus Follows", icon: Users, badge: 0 }] : []),
    ...(can("view_payments") ? [{ to: "/pagamentos", label: "Pagamentos", icon: Wallet, badge: 0 }] : []),
    ...(can("view_dashboard_comercial") ? [{ to: "/dashboard-comercial", label: "Dashboard", icon: BarChart3, badge: 0 }] : []),
    ...(can("view_dashboard_leads") && !can("view_dashboard_comercial") ? [{ to: "/dashboard-leads", label: "Dashboard de Formulário", icon: BarChart3, badge: 0 }] : []),
    ...(can("view_admin") ? [{ to: "/admin", label: "Admin", icon: Settings, badge: 0 }] : []),
    ...(can("view_audit_logs") ? [{ to: "/audit-logs", label: "Logs", icon: ScrollText, badge: 0 }] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  const roleLabel = role === "gestor" ? "Gestor" : role === "closer" ? "Closer" : role === "moderador" ? "Moderador" : "SDR";

  return (
    <div className="flex min-h-screen">
      <OverdueMeetingsLockOverlay />
      {/* Desktop Sidebar — hover-expand */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col transition-all duration-300 border-r sidebar-always-dark",
          "border-r-[hsl(0_0%_100%/0.06)]",
          expanded ? "w-64" : "w-[4.5rem]"
        )}
        style={{
          background: "hsl(var(--sidebar-background) / 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          backgroundImage: "var(--glass-shine)",
        }}
      >
        {/* Logo */}
        <div className="flex h-20 items-center justify-center border-b border-[hsl(0_0%_100%/0.06)]">
          <Link to="/">
            <img
              src={tenantConfig.logoUrl || logo}
              alt={tenantConfig.name}
              className={cn("shrink-0 transition-all duration-300", expanded ? "h-10" : "h-7")}
            />
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 px-3 pt-4">
          {navItems.map(({ to, label, icon: Icon, badge }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive(to)
                  ? "bg-primary/15 text-primary border border-primary/20 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                  : "text-muted-foreground hover:bg-[hsl(0_0%_100%/0.05)] hover:text-foreground border border-transparent"
              )}
            >
              <div className="relative shrink-0">
                <Icon className="h-5 w-5" />
                {badge > 0 && !expanded && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white text-center">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "whitespace-nowrap transition-all duration-300 flex-1",
                expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              )}>
                {label}
              </span>
              {badge > 0 && expanded && (
                <span className="ml-auto min-w-[20px] h-5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white text-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          ))}

          <div className="h-2" />

          {isCloser && closerRecord && (
            <button
              onClick={() => setBlocksOpen(true)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-[hsl(0_0%_100%/0.05)] hover:text-foreground transition-all duration-200 border border-transparent"
            >
              <CalendarOff className="h-5 w-5 shrink-0" />
              <span className={cn(
                "whitespace-nowrap transition-all duration-300",
                expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              )}>
                Compromissos
              </span>
            </button>
          )}
        </nav>

        {/* Footer */}
        <div className={cn(
          "border-t border-[hsl(0_0%_100%/0.06)] px-3 py-4 transition-all duration-300",
          expanded ? "opacity-100" : "opacity-0"
        )}>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30 text-[10px]">
              {roleLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            </button>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex md:hidden items-center justify-between h-14 px-4 glass border-b border-[hsl(0_0%_100%/0.06)] sidebar-always-dark">
        <Link to="/" className="flex items-center gap-2">
          <img src={tenantConfig.logoUrl || logo} alt={tenantConfig.name} className="h-7 w-7" />
          <span className="font-display text-lg font-bold tracking-tight">
            {tenantConfig.name}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <nav className="absolute top-14 left-0 right-0 glass-card-intense flex flex-col gap-1 p-4 sidebar-always-dark">
            {navItems.map(({ to, label, icon: Icon, badge }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive(to)
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span className="min-w-[20px] h-5 rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white text-center">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            ))}
            {isCloser && closerRecord && (
              <button
                onClick={() => { setBlocksOpen(true); setMobileOpen(false); }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <CalendarOff className="h-5 w-5" />
                Compromissos
              </button>
            )}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </button>
          </nav>
        </div>
      )}

      {/* Main content */}
      <div className={cn(
        "flex-1 flex flex-col min-h-screen transition-all duration-300",
        "pt-14 md:pt-0",
        expanded ? "md:ml-64" : "md:ml-[4.5rem]"
      )}>
        {/* Top bar (desktop): notification bell */}
        <div className="hidden md:flex items-center justify-end px-4 pt-3">
          <NotificationBell />
        </div>

        {/* Google Calendar Banner */}
        <div className="px-4 pt-3">
          <GoogleCalendarBanner />
        </div>

        {/* Reuniões pendentes de fechamento (dias passados) */}
        <div className="px-4 pt-3">
          <PendingMeetingsBanner />
        </div>

        {/* Follow-ups atrasados (closer) */}
        <div className="px-4 pt-3">
          <OverdueFollowUpsBanner />
        </div>

        <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Closer blocks dialog */}
      <CloserBlockDialog open={blocksOpen} onOpenChange={setBlocksOpen} />
    </div>
  );
}
