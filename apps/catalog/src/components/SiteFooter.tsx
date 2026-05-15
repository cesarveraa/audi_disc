import {
  ArrowRight,
  Banknote,
  Clock3,
  CreditCard,
  Landmark,
  Mail,
  MapPin,
  MessageCircle,
  QrCode,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { business } from '../config/business';
import { whatsappHref } from './WhatsAppButton';

const topCategories = ['Parlantes JBL', 'Audifonos Sony', 'Accesorios Ewtto'];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#030303] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8 lg:py-16">
        <section aria-label="Identidad Audi Disc">
          <Link to="/" className="inline-flex items-center gap-3" aria-label="Audi Disc Sucre">
            <img
              src="/audidisc.jpg"
              alt="Audi Disc Sucre"
              className="h-12 w-12 rounded-2xl border border-white/10 object-cover"
              loading="lazy"
            />
            <div className="leading-tight">
              <strong className="block text-base tracking-wide text-white">AUDI DISC</strong>
              <span className="text-xs font-semibold uppercase text-audi-red">Sucre Premium Tech</span>
            </div>
          </Link>
          <p className="mt-5 max-w-xs text-sm leading-6 text-white/60">
            Desde Sucre, Audi Disc acompana a la comunidad chuquisaquena con tecnologia original, asesoria real y
            garantia local para comprar con confianza.
          </p>
        </section>

        <section aria-label="Explorar catalogo">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Explora</h2>
          <nav className="mt-5 grid gap-3 text-sm text-white/60" aria-label="Enlaces del catalogo">
            <Link to="/productos" className="inline-flex items-center gap-2 transition hover:text-white">
              Catalogo completo
              <ArrowRight className="h-3.5 w-3.5 text-audi-red" />
            </Link>
            <a href="/#nuevos-ingresos" className="transition hover:text-white">
              Nuevos ingresos
            </a>
            <a href="/#marcas" className="transition hover:text-white">
              Mundos de marca
            </a>
            {topCategories.map(category => (
              <Link key={category} to="/productos" className="transition hover:text-white">
                {category}
              </Link>
            ))}
          </nav>
        </section>

        <section aria-label="Atencion Audi Disc">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Atencion</h2>
          <div className="mt-5 grid gap-3 text-sm leading-6 text-white/60">
            <span className="inline-flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-audi-red" />
              {business.streetAddress}, {business.city}
            </span>
            <span className="inline-flex gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-audi-red" />
              Manana y tarde: {business.openingHours}
            </span>
            <a href={whatsappHref()} target="_blank" rel="noreferrer" className="inline-flex gap-2 transition hover:text-white">
              <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-audi-red" />
              WhatsApp Business {business.phone}
            </a>
            <a href="mailto:ventas@audidisc.com" className="inline-flex gap-2 transition hover:text-white">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-audi-red" />
              ventas@audidisc.com
            </a>
          </div>
        </section>

        <section aria-label="Metodos de pago">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Pagos</h2>
          <div className="mt-5 grid gap-3 text-sm text-white/60">
            <span className="inline-flex items-center gap-2">
              <QrCode className="h-4 w-4 text-audi-red" />
              QR bancos bolivianos
            </span>
            <span className="inline-flex items-center gap-2">
              <Landmark className="h-4 w-4 text-audi-red" />
              Transferencias bancarias
            </span>
            <span className="inline-flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-audi-red" />
              Tarjetas segun disponibilidad
            </span>
            <span className="inline-flex items-center gap-2">
              <Banknote className="h-4 w-4 text-audi-red" />
              Efectivo en tienda
            </span>
          </div>
        </section>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/40">
        Audi Disc Sucre. Catalogo publico optimizado para busquedas locales en Chuquisaca.
      </div>
    </footer>
  );
}
