import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CalendarDays, PlusCircle, Settings, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.png";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, role, signOut, isGestor } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { to: "/", label: "Agenda", icon: CalendarDays },
    { to: "/agendar", label: "Agendar", icon: PlusCircle },
    ...(isGestor ? [{ to: "/admin", label: "Admin", icon: Settings }] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <img src={logo} alt="Grupo Silva" className="h-7 w-7" />
            Grupo <span className="text-primary">Silva</span>
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
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </nav>
        )}
      </header>

      {/* Main */}
      <main className="container flex-1 py-6">
        {children}
      </main>
    </div>
  );
}
