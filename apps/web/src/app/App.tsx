import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

import { AuthProvider, useAuth } from '@app/providers/AuthProvider';
import { ErrorBoundary } from './ErrorBoundary';
import LoginScreen from '@features/auth/screens/LoginScreen';

const InventoryScreen = lazy(() => import('@features/inventory/screens/InventoryScreen'));
const ReportsDashboardScreen = lazy(() => import('@features/reports/screens/ReportsDashboardScreen'));
const SalesHistoryScreen = lazy(() => import('@features/sales/screens/SalesHistoryScreen'));
const POSScreen = lazy(() => import('@features/sales/screens/POSScreen'));
const CustomersScreen = lazy(() => import('@features/customers/screens/CustomersScreen'));
const AuditLogScreen = lazy(() => import('@features/audit/screens/AuditLogScreen'));
const AdvancedAnalyticsScreen = lazy(() => import('@features/analytics/screens/AdvancedAnalyticsScreen'));

function useCurrentPath() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    window.addEventListener('audidisc:navigate', syncPath);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener('audidisc:navigate', syncPath);
    };
  }, []);

  return path;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const path = useCurrentPath();
  const { isAdmin, isLoading, user } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (!user && !path.startsWith('/login')) {
      window.history.replaceState({}, '', '/login');
      window.dispatchEvent(new Event('audidisc:navigate'));
      return;
    }
    if (user && path.startsWith('/login')) {
      window.history.replaceState({}, '', '/inventario');
      window.dispatchEvent(new Event('audidisc:navigate'));
    }
  }, [isLoading, path, user]);

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-gray-950 text-white">
        <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 text-sm font-semibold">
          Validando sesion segura...
        </div>
      </main>
    );
  }

  if (!user || path.startsWith('/login')) {
    return user ? <LazyShell><InventoryScreen /></LazyShell> : <LoginScreen />;
  }

  if (
    path.startsWith('/reportes') ||
    path.startsWith('/historial') ||
    path.startsWith('/auditoria') ||
    path.startsWith('/bi')
  ) {
    if (!isAdmin) {
      return <LazyShell><InventoryScreen /></LazyShell>;
    }
    return (
      <LazyShell>
        {path.startsWith('/historial') ? (
          <SalesHistoryScreen />
        ) : path.startsWith('/auditoria') ? (
          <AuditLogScreen />
        ) : path.startsWith('/bi') ? (
          <AdvancedAnalyticsScreen />
        ) : (
          <ReportsDashboardScreen />
        )}
      </LazyShell>
    );
  }

  if (path.startsWith('/clientes')) {
    return <LazyShell><CustomersScreen /></LazyShell>;
  }

  return (
    <LazyShell>
      {path.startsWith('/ventas') ? <POSScreen /> : <InventoryScreen />}
    </LazyShell>
  );
}

function LazyShell({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-screen place-items-center bg-gray-950 text-white">
          <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-5 py-4 text-sm font-semibold">
            Cargando experiencia Audi Disc...
          </div>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
