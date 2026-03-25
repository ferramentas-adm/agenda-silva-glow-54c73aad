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
import { CalendarDays, PlusCircle, Settings, LogOut, Menu, X, ScrollText, Clock, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import GoogleCalendarBanner from "@/components/GoogleCalendarBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, isGestor } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [editRanges, setEditRanges] = useState<{ start: string; end: string }[]>([{ start: "09:00", end: "23:00" }]);
  const [saving, setSaving] = useState(false);

  const isCloser = role === "closer";

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
      const { error } = await supabase.from("closers")
        .update({
          business_hours_start: firstStart,
          business_hours_end: lastEnd,
          business_hours_ranges: editRanges,
        } as any)
        .eq("id", closerRecord.id);
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
    { to: "/", label: "Agenda", icon: CalendarDays },
    { to: "/agendar", label: "Agendar", icon: PlusCircle },
    ...(isGestor ? [
      { to: "/admin", label: "Admin", icon: Settings },
      { to: "/audit-logs", label: "Logs", icon: ScrollText },
    ] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <img src={logo} alt="Grupo Silva" className="h-7 w-7" />
            <span>Grupo <span className="text-primary">Silva</span></span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to}>
                <Button
                  variant={isActive(to) ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            ))}
            {isCloser && closerRecord && (
              <Button variant="ghost" size="sm" onClick={openHoursDialog} className="gap-2" title="Meu horário de trabalho">
                <Clock className="h-4 w-4" />
                <span className="hidden lg:inline">Meu Horário</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </nav>

          {/* Mobile menu toggle */}
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile nav */}
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-primary/10 p-3 md:hidden">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} onClick={() => setMenuOpen(false)}>
                <Button
                  variant={isActive(to) ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            ))}
            {isCloser && closerRecord && (
              <Button variant="ghost" size="sm" onClick={() => { openHoursDialog(); setMenuOpen(false); }} className="w-full justify-start gap-2">
                <Clock className="h-4 w-4" />
                Meu Horário
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </nav>
        )}
      </header>

      {/* Google Calendar Banner for closers */}
      <div className="container pt-2">
        <GoogleCalendarBanner />
      </div>

      {/* Main */}
      <main className="container flex-1 py-6">
        {children}
      </main>

      {/* Closer hours dialog */}
      <AlertDialog open={hoursOpen} onOpenChange={setHoursOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meu Horário de Trabalho</AlertDialogTitle>
          <AlertDialogDescription>
              Configure os turnos em que você está disponível. Adicione múltiplos turnos para intervalos (ex: almoço).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {editRanges.map((range, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Turno {idx + 1} - Início</label>
                  <Input type="time" value={range.start} onChange={(e) => { const nr = [...editRanges]; nr[idx] = { ...nr[idx], start: e.target.value }; setEditRanges(nr); }} className="font-mono" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Fim</label>
                  <Input type="time" value={range.end} onChange={(e) => { const nr = [...editRanges]; nr[idx] = { ...nr[idx], end: e.target.value }; setEditRanges(nr); }} className="font-mono" />
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
    </div>
  );
}
