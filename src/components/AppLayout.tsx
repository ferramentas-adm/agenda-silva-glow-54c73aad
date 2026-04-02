import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarDays, PlusCircle, Settings, LogOut, Menu, X, ScrollText, Clock, Loader2, CalendarOff, List, Sun, Moon } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import GoogleCalendarBanner from "@/components/GoogleCalendarBanner";
import CloserBlockDialog from "@/components/CloserBlockDialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, isGestor } = useAuth();
  const isModerador = role === "moderador";
  const location = useLocation();
  const queryClient = useQueryClient();
  const [hoursOpen, setHoursOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [editRanges, setEditRanges] = useState<{ start: string; end: string }[]>([{ start: "09:00", end: "23:00" }]);
  const [saving, setSaving] = useState(false);

  // Sidebar hover-expand state
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCloser = role === "closer";

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

  // Fetch closer record for current user (by email)
  const { data: closerRecord } = useQuery({
    queryKey: ["my-closer-record", user?.email],
    enabled: isCloser && !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, business_hours_start, business_hours_end, business_hours_ranges").eq("email", user!.email!).single();
      return data;
    },
  });

  const openHoursDialog = () => {
    const ranges = (closerRecord as any)?.business_hours_ranges && Array.isArray((closerRecord as any).business_hours_ranges) && (closerRecord as any).business_hours_ranges.length > 0
      ? [...(closerRecord as any).business_hours_ranges]
      : [{ start: closerRecord?.business_hours_start || "09:00", end: closerRecord?.business_hours_end || "23:00" }];
    setEditRanges(ranges);
    setHoursOpen(true);
  };

  const handleSaveHours = async () => {
    if (!closerRecord) return;
    setSaving(true);
    try {
      const firstStart = editRanges[0]?.start || "09:00";
      const lastEnd = editRanges[editRanges.length - 1]?.end || "23:00";
      const { error, count } = await supabase.from("closers")
        .update({
          business_hours_start: firstStart,
          business_hours_end: lastEnd,
          business_hours_ranges: editRanges,
        } as any)
        .eq("id", closerRecord.id)
        .select();
      if (error) throw error;
      toast.success("Horário atualizado!");
      queryClient.invalidateQueries({ queryKey: ["my-closer-record"] });
      queryClient.invalidateQueries({ queryKey: ["closer-hours"] });
      setHoursOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar horário");
    }
    setSaving(false);
  };

  const navItems = [
    { to: "/", label: "Calendário", icon: CalendarDays },
    { to: "/reunioes", label: "Reuniões", icon: List },
    ...((isGestor || isModerador) ? [
      { to: "/admin", label: "Admin", icon: Settings },
    ] : []),
    ...(isGestor ? [
      { to: "/audit-logs", label: "Logs", icon: ScrollText },
    ] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  const roleLabel = role === "gestor" ? "Gestor" : role === "closer" ? "Closer" : role === "moderador" ? "Moderador" : "SDR";

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar — hover-expand */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden md:flex flex-col transition-all duration-300 border-r",
          "border-r-[hsl(0_0%_100%/0.06)]",
          expanded ? "w-64" : "w-[4.5rem]"
        )}
        style={{
          background: "hsl(240 5% 5% / 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          backgroundImage: "linear-gradient(135deg, hsl(0 0% 100% / 0.03) 0%, transparent 50%)",
        }}
      >
        {/* Logo */}
        <div className="flex h-20 items-center justify-center border-b border-[hsl(0_0%_100%/0.06)]">
          <Link to="/">
            <img
              src={logo}
              alt="Grupo Silva"
              className={cn("shrink-0 transition-all duration-300", expanded ? "h-10" : "h-7")}
            />
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 px-3 pt-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive(to)
                  ? "bg-primary/15 text-primary border border-primary/20 shadow-[0_0_12px_hsl(var(--primary)/0.1)]"
                  : "text-muted-foreground hover:bg-[hsl(0_0%_100%/0.05)] hover:text-foreground border border-transparent"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={cn(
                "whitespace-nowrap transition-all duration-300",
                expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              )}>
                {label}
              </span>
            </Link>
          ))}

          <div className="h-2" />

          {isCloser && closerRecord && (
            <>
              <button
                onClick={openHoursDialog}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-[hsl(0_0%_100%/0.05)] hover:text-foreground transition-all duration-200 border border-transparent"
              >
                <Clock className="h-5 w-5 shrink-0" />
                <span className={cn(
                  "whitespace-nowrap transition-all duration-300",
                  expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                )}>
                  Meu Horário
                </span>
              </button>
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
            </>
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
      <header className="fixed top-0 left-0 right-0 z-50 flex md:hidden items-center justify-between h-14 px-4 glass border-b border-[hsl(0_0%_100%/0.06)]">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="Grupo Silva" className="h-7 w-7" />
          <span className="font-display text-lg font-bold tracking-tight">
            Grupo <span className="text-primary">Silva</span>
          </span>
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile nav overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <nav className="absolute top-14 left-0 right-0 glass-card-intense flex flex-col gap-1 p-4">
            {navItems.map(({ to, label, icon: Icon }) => (
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
                {label}
              </Link>
            ))}
            {isCloser && closerRecord && (
              <>
                <button
                  onClick={() => { openHoursDialog(); setMobileOpen(false); }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <Clock className="h-5 w-5" />
                  Meu Horário
                </button>
                <button
                  onClick={() => { setBlocksOpen(true); setMobileOpen(false); }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <CalendarOff className="h-5 w-5" />
                  Compromissos
                </button>
              </>
            )}
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
        {/* Google Calendar Banner */}
        <div className="px-4 pt-3">
          <GoogleCalendarBanner />
        </div>

        <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Closer hours dialog */}
      <AlertDialog open={hoursOpen} onOpenChange={setHoursOpen}>
        <AlertDialogContent className="glass-card-intense border-[hsl(0_0%_100%/0.1)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Meu Horário de Trabalho</AlertDialogTitle>
            <AlertDialogDescription>
              Configure os turnos em que você está disponível. Adicione múltiplos turnos para intervalos (ex: almoço).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {editRanges.map((range, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Turno {idx + 1} - Início</label>
                  <Input type="time" value={range.start} onChange={(e) => { const nr = [...editRanges]; nr[idx] = { ...nr[idx], start: e.target.value }; setEditRanges(nr); }} className="font-mono glass-input" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fim</label>
                  <Input type="time" value={range.end} onChange={(e) => { const nr = [...editRanges]; nr[idx] = { ...nr[idx], end: e.target.value }; setEditRanges(nr); }} className="font-mono glass-input" />
                </div>
                {editRanges.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive" onClick={() => setEditRanges(editRanges.filter((_, i) => i !== idx))}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" onClick={() => setEditRanges([...editRanges, { start: "14:00", end: "18:00" }])}>
              + Adicionar turno
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveHours} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Closer blocks dialog */}
      <CloserBlockDialog open={blocksOpen} onOpenChange={setBlocksOpen} />
    </div>
  );
}
