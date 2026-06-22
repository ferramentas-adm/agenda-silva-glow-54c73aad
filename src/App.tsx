import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const ForceChangePasswordPage = lazy(() => import("@/pages/ForceChangePasswordPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AgendarPage = lazy(() => import("@/pages/AgendarPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const AuditLogsPage = lazy(() => import("@/pages/AuditLogsPage"));
const ReunioesListPage = lazy(() => import("@/pages/ReunioesListPage"));
const AguardandoAtribuicaoPage = lazy(() => import("@/pages/AguardandoAtribuicaoPage"));
const DashboardComercialPage = lazy(() => import("@/pages/DashboardComercialPage"));
const DashboardLeadsPage = lazy(() => import("@/pages/DashboardLeadsPage"));
const FollowUpsPage = lazy(() => import("@/pages/FollowUpsPage"));
const MeusFollowsPage = lazy(() => import("@/pages/MeusFollowsPage"));
const PagamentosPage = lazy(() => import("@/pages/PagamentosPage"));
const VendaPage = lazy(() => import("@/pages/VendaPage"));
const LeadDetalhesPage = lazy(() => import("@/pages/LeadDetalhesPage"));
const CancelarReuniaoPage = lazy(() => import("@/pages/CancelarReuniaoPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // C3: garbage-collect cached query data after 10 min of inactivity
      // para evitar acúmulo de memória em sessões longas.
      gcTime: 10 * 60_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as any)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
    },
  },
});

const PageSpinner = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageSpinner />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/alterar-senha" element={<ProtectedRoute><ForceChangePasswordPage /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/agendar" element={<ProtectedRoute><AgendarPage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
              <Route path="/audit-logs" element={<ProtectedRoute requireAdmin><AuditLogsPage /></ProtectedRoute>} />
              <Route path="/dashboard-comercial" element={<ProtectedRoute><DashboardComercialPage /></ProtectedRoute>} />
              <Route path="/dashboard-leads" element={<ProtectedRoute><DashboardLeadsPage /></ProtectedRoute>} />
              <Route path="/reunioes" element={<ProtectedRoute><ReunioesListPage /></ProtectedRoute>} />
              <Route path="/aguardando-atribuicao" element={<ProtectedRoute><AguardandoAtribuicaoPage /></ProtectedRoute>} />
              <Route path="/follow-ups" element={<ProtectedRoute><FollowUpsPage /></ProtectedRoute>} />
              <Route path="/meus-follows" element={<ProtectedRoute><MeusFollowsPage /></ProtectedRoute>} />
              <Route path="/pagamentos" element={<ProtectedRoute><PagamentosPage /></ProtectedRoute>} />
              <Route path="/venda/:id" element={<ProtectedRoute><VendaPage /></ProtectedRoute>} />
              <Route path="/lead-detalhes" element={<ProtectedRoute><LeadDetalhesPage /></ProtectedRoute>} />
              <Route path="/lead-detalhes/:id" element={<ProtectedRoute><LeadDetalhesPage /></ProtectedRoute>} />
              <Route path="/cancelar-reuniao/:id" element={<ProtectedRoute><CancelarReuniaoPage /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
