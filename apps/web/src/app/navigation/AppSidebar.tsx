import type { CurrentUser, PermissionKey } from '@audidisc/shared';
import type { MouseEvent } from 'react';
import { hasPermission } from '@audidisc/shared';
import {
  BarChart3,
  Box,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Moon,
  Palette,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  UserRound,
  UsersRound,
} from 'lucide-react';

import { useTheme } from '@app/providers/ThemeProvider';
import { type AppRouteKey, routes } from './routes';

type Props = {
  active: AppRouteKey;
  user: CurrentUser;
  onLogout: () => void | Promise<void>;
};

const navItems: Array<{
  key: AppRouteKey;
  label: string;
  href: string;
  icon: typeof Box;
  permission: PermissionKey;
}> = [
  { key: 'inventory', label: 'Inventario', href: routes.inventory, icon: Box, permission: 'inventory' },
  { key: 'sales', label: 'Ventas POS', href: routes.sales, icon: CreditCard, permission: 'sales' },
  { key: 'customers', label: 'Clientes', href: routes.customers, icon: UserRound, permission: 'customers' },
  { key: 'reports', label: 'Reportes', href: routes.reports, icon: ReceiptText, permission: 'reports' },
  { key: 'history', label: 'Ventas Pasadas', href: routes.history, icon: LayoutDashboard, permission: 'history' },
  { key: 'analytics', label: 'BI', href: routes.analytics, icon: TrendingUp, permission: 'analytics' },
  { key: 'audit', label: 'Auditoria', href: routes.audit, icon: ShieldCheck, permission: 'audit' },
  { key: 'users', label: 'Usuarios', href: routes.users, icon: UsersRound, permission: 'users' },
  { key: 'style', label: 'Guia UI', href: routes.style, icon: Palette, permission: 'style' },
];

function navigateTo(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
    return;
  }
  event.preventDefault();
  if (window.location.pathname !== href) {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new Event('audidisc:navigate'));
  }
}

export function AppSidebar({ active, user, onLogout }: Props) {
  const { theme, toggleTheme } = useTheme();
  const visibleItems = navItems.filter(item => hasPermission(user, item.permission));

  return (
    <aside className="z-20 border-b border-white/60 bg-white/65 px-4 py-4 shadow-sm backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.035] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
      <div className="flex items-center justify-between gap-3 rounded-panel border border-white/70 bg-white/65 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <img src="/audidisc.jpg" alt="Audi Disc" className="h-12 w-12 rounded-2xl object-cover shadow-card" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-audi-red ring-2 ring-white" />
          </div>
          <div className="min-w-0">
            <strong className="block truncate text-base font-semibold text-gray-950 dark:text-white">Audi Disc</strong>
            <span className="block truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-white/45">
              {user.role}
            </span>
          </div>
        </div>
        <Sparkles className="h-5 w-5 text-audi-red" />
      </div>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0" aria-label="Principal">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <a
              key={item.key}
              href={item.href}
              onClick={event => navigateTo(event, item.href)}
              className={[
                'flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99]',
                isActive
                  ? 'bg-white text-gray-950 shadow-sm dark:bg-white dark:text-gray-950'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-950 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white',
              ].join(' ')}
            >
              {isActive && <span className="h-2 w-2 rounded-full bg-audi-red" />}
              <Icon className={['h-4 w-4', isActive ? 'text-gray-500' : 'text-gray-500 dark:text-white/60'].join(' ')} />
              {item.label}
            </a>
          );
        })}
        <button
          className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99] dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={toggleTheme}
          type="button"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-white/60" /> : <Moon className="h-4 w-4 text-gray-500" />}
          {theme === 'dark' ? 'Modo dia' : 'Modo noche'}
        </button>
        <button
          className={[
            'flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99]',
            'text-gray-600 hover:bg-white/70 hover:text-gray-950 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white',
          ].join(' ')}
          onClick={() => void onLogout()}
        >
          <LogOut className="h-4 w-4 text-gray-500 dark:text-white/60" />
          Salir
        </button>
      </nav>

      <div className="mt-6 hidden rounded-panel border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] lg:block">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white">
          <BarChart3 className="h-4 w-4 text-audi-red" />
          Premium Sales
        </div>
        <p className="text-sm leading-6 text-gray-500 dark:text-white/45">
          Guia UI, permisos por zona y tema {theme === 'dark' ? 'noche' : 'dia'} para una experiencia consistente.
        </p>
      </div>
    </aside>
  );
}
