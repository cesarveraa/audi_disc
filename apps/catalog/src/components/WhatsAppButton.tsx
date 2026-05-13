import type { CatalogProduct } from '@audidisc/shared';
import { MessageCircle } from 'lucide-react';

import { business } from '../config/business';

export function whatsappHref(product?: CatalogProduct) {
  const phone = business.phone.replace(/\D/g, '');
  const message = product
    ? `Hola Audi Disc Sucre, deseo consultar la disponibilidad de: ${product.nombre}.`
    : 'Hola Audi Disc Sucre, vi su catálogo web y deseo consultar disponibilidad.';
  const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function ProductWhatsAppButton({
  product,
  className = '',
}: {
  product: CatalogProduct;
  className?: string;
}) {
  return (
    <a
      href={whatsappHref(product)}
      target="_blank"
      rel="noreferrer"
      className={[
        'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-whatsapp px-4 text-sm font-semibold text-catalog-bg transition hover:bg-whatsapp-dark focus:outline-none focus:ring-2 focus:ring-whatsapp focus:ring-offset-2 focus:ring-offset-catalog-card',
        className,
      ].join(' ')}
    >
      <MessageCircle className="h-4 w-4" />
      Consultar por WhatsApp
    </a>
  );
}

export function FloatingWhatsAppButton({ product }: { product?: CatalogProduct }) {
  return (
    <a
      href={whatsappHref(product)}
      target="_blank"
      rel="noreferrer"
      aria-label={product ? `Consultar ${product.nombre} por WhatsApp` : 'Consultar por WhatsApp'}
      className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-catalog-bg shadow-whatsapp transition hover:-translate-y-0.5 hover:bg-whatsapp-dark focus:outline-none focus:ring-2 focus:ring-whatsapp focus:ring-offset-2 focus:ring-offset-catalog-bg sm:bottom-7 sm:right-7 sm:w-auto sm:px-5"
    >
      <MessageCircle className="h-6 w-6" />
      <span className="hidden pl-2 text-sm font-semibold sm:inline">WhatsApp</span>
    </a>
  );
}
