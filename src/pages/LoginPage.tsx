import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src={logo} alt="Grupo Silva" className="h-16 w-16" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Grupo <span className="text-primary">Silva</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Painel de Agendamentos</p>
          </div>
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
              />
            </div>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
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
  );
}
