import type { CurrentUser } from '@audidisc/shared';
import type { MouseEvent } from 'react';
import {
  BarChart3,
  Box,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';

import { type AppRouteKey, routes } from './routes';

type SidebarTheme = 'light' | 'dark';

type Props = {
  active: AppRouteKey;
  user: CurrentUser;
  isAdmin: boolean;
  onLogout: () => void | Promise<void>;
  theme?: SidebarTheme;
};

const navItems: Array<{
  key: AppRouteKey;
  label: string;
  href: string;
  icon: typeof Box;
  adminOnly?: boolean;
}> = [
  { key: 'inventory', label: 'Inventario', href: routes.inventory, icon: Box },
  { key: 'sales', label: 'Ventas POS', href: routes.sales, icon: CreditCard },
  { key: 'customers', label: 'Clientes', href: routes.customers, icon: UserRound },
  { key: 'reports', label: 'Reportes', href: routes.reports, icon: ReceiptText, adminOnly: true },
  { key: 'history', label: 'Ventas Pasadas', href: routes.history, icon: LayoutDashboard, adminOnly: true },
  { key: 'analytics', label: 'BI', href: routes.analytics, icon: TrendingUp, adminOnly: true },
  { key: 'audit', label: 'Auditoria', href: routes.audit, icon: ShieldCheck, adminOnly: true },
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

function classes(theme: SidebarTheme) {
  const dark = theme === 'dark';
  return {
    aside: dark
      ? 'z-20 border-b border-white/10 bg-white/[0.04] px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6'
      : 'z-20 border-b border-white/60 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6',
    brand: dark
      ? 'flex items-center justify-between gap-3 rounded-panel border border-white/10 bg-white/[0.06] p-3 shadow-sm backdrop-blur-xl'
      : 'flex items-center justify-between gap-3 rounded-panel border border-white/70 bg-white/55 p-3 shadow-sm backdrop-blur-xl',
    title: dark ? 'text-white' : 'text-gray-950',
    meta: dark ? 'text-white/45' : 'text-gray-500',
    navIdle: dark
      ? 'text-white/55 hover:bg-white/10 hover:text-white'
      : 'text-gray-600 hover:bg-white/70 hover:text-gray-950',
    navActive: dark
      ? 'bg-white text-gray-950 shadow-sm'
      : 'bg-white text-gray-950 shadow-sm',
    iconIdle: dark ? 'text-white/60' : 'text-gray-500',
    info: dark
      ? 'hidden rounded-panel border border-white/10 bg-white/[0.06] p-4 shadow-sm backdrop-blur-xl lg:block'
      : 'hidden rounded-panel border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl lg:block',
    infoText: dark ? 'text-white/45' : 'text-gray-500',
  };
}

export function AppSidebar({ active, user, isAdmin, onLogout, theme = 'light' }: Props) {
  const css = classes(theme);
  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside className={css.aside}>
      <div className={css.brand}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <img src="/audidisc.jpg" alt="Audi Disc" className="h-12 w-12 rounded-2xl object-cover shadow-card" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-audi-red ring-2 ring-white" />
          </div>
          <div className="min-w-0">
            <strong className={`block truncate text-base font-semibold ${css.title}`}>Audi Disc</strong>
            <span className={`block truncate text-xs font-semibold uppercase tracking-[0.14em] ${css.meta}`}>
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
                isActive ? css.navActive : css.navIdle,
              ].join(' ')}
            >
              {isActive && <span className="h-2 w-2 rounded-full bg-audi-red" />}
              <Icon className={['h-4 w-4', isActive ? 'text-gray-500' : css.iconIdle].join(' ')} />
              {item.label}
            </a>
          );
        })}
        <button
          className={[
            'flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition active:scale-[0.99]',
            css.navIdle,
          ].join(' ')}
          onClick={() => void onLogout()}
        >
          <LogOut className={['h-4 w-4', css.iconIdle].join(' ')} />
          Salir
        </button>
      </nav>

      <div className={`mt-6 ${css.info}`}>
        <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${css.title}`}>
          <BarChart3 className="h-4 w-4 text-audi-red" />
          Premium Sales
        </div>
        <p className={`text-sm leading-6 ${css.infoText}`}>
          Inventario, ventas, clientes, reportes y auditoria en una navegacion consistente para escritorio y movil.
        </p>
      </div>
    </aside>
  );
}
