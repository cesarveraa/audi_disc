import { Link, NavLink } from 'react-router-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';

import { whatsappHref } from './WhatsAppButton';

type Props = {
  variant?: 'transparent' | 'solid';
};

export function SiteNav({ variant = 'solid' }: Props) {
  const isTransparent = variant === 'transparent';
  const headerClass = isTransparent
    ? 'absolute inset-x-0 top-0 z-40 border-b border-white/10 bg-catalog-bg/20 text-white backdrop-blur-md'
    : 'sticky top-0 z-40 border-b border-white/10 bg-catalog-bg/95 text-white backdrop-blur-md';

  return (
    <header className={headerClass}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Audi Disc Sucre">
          <img
            src="/audidisc.jpg"
            alt="Audi Disc Sucre"
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
            loading="eager"
          />
          <div className="leading-tight">
            <span className="block text-sm font-semibold text-white">AUDI DISC</span>
            <span className="block text-xs font-medium text-white/60">Sucre, Bolivia</span>
          </div>
        </Link>

        <div className="hidden items-center gap-2 sm:flex">
          <NavLink
            to="/"
            className={({ isActive }) =>
              [
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              ].join(' ')
            }
          >
            Inicio
          </NavLink>
          <NavLink
            to="/productos"
            end
            className={({ isActive }) =>
              [
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                isActive ? 'bg-audi-red text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              ].join(' ')
            }
          >
            Productos
          </NavLink>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={whatsappHref()}
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold text-white/90 transition hover:border-whatsapp hover:bg-whatsapp hover:text-catalog-bg md:inline-flex"
          >
            <MessageCircle className="h-4 w-4" />
            Consultar
          </a>
          <Link
            to="/productos"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-audi-red px-3 text-sm font-semibold text-white shadow-red transition hover:bg-audi-redDark"
          >
            Catálogo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
