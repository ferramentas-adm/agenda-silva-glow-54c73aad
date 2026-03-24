import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff, AlertCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

export default function ForceChangePasswordPage() {
  const { user, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Clear must_change_password flag
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("user_id", user!.id);

      if (profileError) throw profileError;

      toast.success("Senha atualizada com sucesso!");
      // Force reload to clear the flag in context
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar senha");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <img src={logo} alt="Grupo Silva" className="h-16 w-16" />
          <div>
            <ShieldCheck className="h-8 w-8 text-primary mx-auto mb-2" />
            <h1 className="text-2xl font-bold tracking-tight">Altere sua senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Por segurança, você precisa criar uma nova senha antes de continuar.
            </p>
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
            {loading ? <Loader2 className="animate-spin" /> : "Salvar nova senha"}
          </Button>

          <button
            type="button"
            className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
            onClick={() => signOut()}
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
