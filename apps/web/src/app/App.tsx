import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { PermissionKey } from '@audidisc/shared';
import { hasPermission } from '@audidisc/shared';

import { AuthProvider, useAuth } from '@app/providers/AuthProvider';
import { ThemeProvider } from '@app/providers/ThemeProvider';
import { ErrorBoundary } from './ErrorBoundary';
import LoginScreen from '@features/auth/screens/LoginScreen';

const InventoryScreen = lazy(() => import('@features/inventory/screens/InventoryScreen'));
const ReportsDashboardScreen = lazy(() => import('@features/reports/screens/ReportsDashboardScreen'));
const SalesHistoryScreen = lazy(() => import('@features/sales/screens/SalesHistoryScreen'));
const POSScreen = lazy(() => import('@features/sales/screens/POSScreen'));
const CustomersScreen = lazy(() => import('@features/customers/screens/CustomersScreen'));
const AuditLogScreen = lazy(() => import('@features/audit/screens/AuditLogScreen'));
const AdvancedAnalyticsScreen = lazy(() => import('@features/analytics/screens/AdvancedAnalyticsScreen'));
const UsersAccessScreen = lazy(() => import('@features/users/screens/UsersAccessScreen'));
const StyleGuideScreen = lazy(() => import('@features/style/screens/StyleGuideScreen'));

const routePermissions: Array<{ prefix: string; permission: PermissionKey }> = [
  { prefix: '/inventario', permission: 'inventory' },
  { prefix: '/ventas', permission: 'sales' },
  { prefix: '/clientes', permission: 'customers' },
  { prefix: '/reportes', permission: 'reports' },
  { prefix: '/historial', permission: 'history' },
  { prefix: '/bi', permission: 'analytics' },
  { prefix: '/auditoria', permission: 'audit' },
  { prefix: '/usuarios', permission: 'users' },
  { prefix: '/estilo', permission: 'style' },
];

const fallbackRoutes: Array<{ path: string; permission: PermissionKey }> = [
  { path: '/inventario', permission: 'inventory' },
  { path: '/ventas', permission: 'sales' },
  { path: '/clientes', permission: 'customers' },
  { path: '/reportes', permission: 'reports' },
  { path: '/historial', permission: 'history' },
  { path: '/bi', permission: 'analytics' },
  { path: '/auditoria', permission: 'audit' },
  { path: '/usuarios', permission: 'users' },
];

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
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const path = useCurrentPath();
  const { isLoading, user } = useAuth();
  const defaultPath = user
    ? (fallbackRoutes.find(route => hasPermission(user, route.permission))?.path ?? '/estilo')
    : '/login';

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
      window.history.replaceState({}, '', defaultPath);
      window.dispatchEvent(new Event('audidisc:navigate'));
    }
  }, [defaultPath, isLoading, path, user]);

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

  const requiredRoute = routePermissions.find(route => path.startsWith(route.prefix));
  if (requiredRoute && !hasPermission(user, requiredRoute.permission)) {
    return <LazyShell><NoAccessScreen defaultPath={defaultPath} /></LazyShell>;
  }

  if (path.startsWith('/reportes') || path.startsWith('/historial') || path.startsWith('/auditoria') || path.startsWith('/bi')) {
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

  if (path.startsWith('/usuarios')) {
    return <LazyShell><UsersAccessScreen /></LazyShell>;
  }

  if (path.startsWith('/estilo')) {
    return <LazyShell><StyleGuideScreen /></LazyShell>;
  }

  return (
    <LazyShell>
      {path.startsWith('/ventas') ? <POSScreen /> : hasPermission(user, 'inventory') ? <InventoryScreen /> : <NoAccessScreen defaultPath={defaultPath} />}
    </LazyShell>
  );
}

function NoAccessScreen({ defaultPath }: { defaultPath: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fa] px-4 text-gray-950 dark:bg-[#070707] dark:text-white">
      <section className="max-w-md rounded-[28px] border border-gray-200 bg-white p-6 text-center shadow-card dark:border-white/10 dark:bg-white/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-audi-red">Acceso limitado</p>
        <h1 className="mt-3 text-3xl font-semibold">Tu rol no tiene esta zona activa</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-white/55">
          Pide a un Administrador que habilite el permiso correspondiente desde Usuarios y roles.
        </p>
        <a
          href={defaultPath}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-audi-red px-5 text-sm font-semibold text-white shadow-button"
        >
          Ir a mi inicio
        </a>
      </section>
    </main>
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
