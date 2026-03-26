import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children, requireGestor = false, requireAdmin = false }: { children: React.ReactNode; requireGestor?: boolean; requireAdmin?: boolean }) {
  const { user, loading, isGestor, isModerador, mustChangePassword } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (mustChangePassword && location.pathname !== "/alterar-senha") {
    return <Navigate to="/alterar-senha" replace />;
  }

  if (requireGestor && !isGestor) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && !isGestor && !isModerador) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
