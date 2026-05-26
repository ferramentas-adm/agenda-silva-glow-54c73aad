import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import logo from "@/assets/logo.png";
import { tenantConfig } from "@/config/tenant";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validatePassword = (pw: string): string[] => {
    const errs: string[] = [];
    if (pw.length < 8) errs.push("Mínimo 8 caracteres");
    if (!/[A-Z]/.test(pw)) errs.push("Pelo menos 1 letra maiúscula");
    if (!/[0-9]/.test(pw)) errs.push("Pelo menos 1 número");
    return errs;
  };

  const passwordErrors = password ? validatePassword(password) : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    const errs = validatePassword(password);
    if (errs.length > 0) {
      setError(errs.join(", "));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <img src={tenantConfig.logoUrl || logo} alt={tenantConfig.name} className="h-16 w-16 mx-auto" />
          <h1 className="text-xl font-bold">Link inválido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de recuperação de senha é inválido ou expirou.
          </p>
          <Button onClick={() => navigate("/login")} className="w-full">
            Voltar ao login
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-xl font-bold">Senha alterada!</h1>
          <p className="text-sm text-muted-foreground">
            Sua senha foi alterada com sucesso. Redirecionando para o login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src={tenantConfig.logoUrl || logo} alt={tenantConfig.name} className="h-16 w-16" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Redefinir senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">Crie uma nova senha para sua conta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Nova senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
              autoFocus
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

          {passwordErrors.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {passwordErrors.map((err) => (
                <p key={err} className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />{err}
                </p>
              ))}
            </div>
          )}

          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Confirmar nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || passwordErrors.length > 0}>
            {loading ? <Loader2 className="animate-spin" /> : "Redefinir senha"}
          </Button>
        </form>
      </div>
    </div>
  );
}
