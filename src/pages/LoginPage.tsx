import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import loginBg from "@/assets/login-bg.webp";

export default function LoginPage() {
  const { signIn, user } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || "/";

  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
      setForgotMode(false);
    }
    setForgotLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(66_83%_55%/0.04),transparent_60%)]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 md:gap-12 px-6 animate-fade-in">
        {/* Logo section */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={logo}
            alt="Grupo Silva"
            className="h-14 md:h-44 drop-shadow-[0_0_24px_hsl(66_83%_55%/0.25)]"
          />
          <div className="hidden md:block">
            <h1 className="font-display text-3xl font-bold tracking-tight glow-text">
              Grupo <span className="text-primary">Silva</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Painel de Agendamentos</p>
          </div>
        </div>

        {/* Vertical divider — desktop only */}
        <div className="hidden md:block w-px h-48 bg-primary/60" />

        {/* Login card */}
        <div className="w-full max-w-sm glass-card-intense rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          {/* Mobile title */}
          <div className="mb-6 text-center md:hidden">
            <h1 className="font-display text-2xl font-bold tracking-tight glow-text">
              Grupo <span className="text-primary">Silva</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Painel de Agendamentos</p>
          </div>

          {/* Desktop card title */}
          <div className="hidden md:block mb-6">
            <h2 className="font-display text-lg font-semibold glow-text">Entrar</h2>
            <div className="mt-2 h-px w-12 bg-primary/40" />
          </div>

          {forgotMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Informe seu e-mail para receber o link de recuperação de senha.
              </p>
              <Input
                type="email"
                placeholder="E-mail"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                autoFocus
                className="glass-input"
              />
              <Button type="submit" className="w-full" disabled={forgotLoading}>
                {forgotLoading ? <Loader2 className="animate-spin" /> : "Enviar link de recuperação"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setForgotMode(false)}
              >
                Voltar ao login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="glass-input"
                />
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10 glass-input"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : "Entrar"}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => { setForgotMode(true); setForgotEmail(email); }}
              >
                Esqueci minha senha
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
