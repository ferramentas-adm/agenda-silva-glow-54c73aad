import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Barreira de erro global: sem ela, qualquer exceção de render desmonta a árvore
 * inteira e o usuário vê apenas uma tela escura, sem pista do que aconteceu.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Mantém o rastro no console para diagnóstico via Dev Mode / logs do preview.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-xl border border-destructive/30 bg-card p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-destructive">
                Algo deu errado ao carregar esta tela
              </h1>
              <p className="text-sm text-muted-foreground">
                Recarregue a página. Se o erro continuar, informe a mensagem abaixo ao suporte.
              </p>
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                {error.message}
              </pre>
              <Button onClick={this.handleReload} size="sm">
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
