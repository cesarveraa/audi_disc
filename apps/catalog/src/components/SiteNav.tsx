import { ArrowRight, MapPin, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { whatsappHref } from './WhatsAppButton';

type Props = {
  variant?: 'transparent' | 'solid';
};

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-full px-3 py-2 text-sm font-semibold transition duration-200',
    isActive ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white',
  ].join(' ');

export function SiteNav({ variant = 'solid' }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const isTransparent = variant === 'transparent';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 18);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const floating = isTransparent && !scrolled;

  return (
    <header
      className={[
        isTransparent ? 'fixed' : 'sticky',
        'inset-x-0 top-0 z-40 border-b text-white transition-all duration-300',
        floating
          ? 'border-white/5 bg-black/20 backdrop-blur-md'
          : 'border-white/10 bg-catalog-glass shadow-card backdrop-blur-2xl',
      ].join(' ')}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Audi Disc Sucre">
          <img
            src="/audidisc.jpg"
            alt="Audi Disc Sucre"
            className="h-10 w-10 shrink-0 rounded-2xl border border-white/10 object-cover shadow-card"
            loading="eager"
          />
          <div className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold tracking-[0.16em] text-white">AUDI DISC</span>
            <span className="hidden text-xs font-medium text-white/60 md:block">Premium Tech Sucre</span>
          </div>
        </Link>

        <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.045] p-1 backdrop-blur-xl sm:flex">
          <NavLink to="/" end className={navItemClass}>
            Inicio
          </NavLink>
          <NavLink to="/productos" end className={navItemClass}>
            Productos
          </NavLink>
          <a
            href="/#ubicacion"
            className="inline-flex rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Ubicacion
          </a>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/#ubicacion"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition hover:border-audi-red hover:text-white md:hidden"
            aria-label="Ver ubicacion en el mapa"
          >
            <MapPin className="h-4 w-4" />
          </a>
          <a
            href={whatsappHref()}
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-white/90 transition hover:border-whatsapp hover:bg-whatsapp hover:text-black md:inline-flex"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <Link
            to="/productos"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-audi-red px-4 text-sm font-semibold text-white shadow-red transition hover:-translate-y-0.5 hover:bg-audi-redDark"
          >
            Catalogo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
