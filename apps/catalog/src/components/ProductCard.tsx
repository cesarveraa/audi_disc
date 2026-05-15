import type { CatalogProduct } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';
import { BadgeCheck, CheckCircle2, ExternalLink, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import { productPath } from '../utils/catalog';
import { ProductImage } from './ProductImage';
import { ProductWhatsAppButton } from './WhatsAppButton';

type Props = {
  product: CatalogProduct;
};

function brandLabel(product: CatalogProduct) {
  return product.marca?.trim() || 'Audi Disc';
}

function brandMark(product: CatalogProduct) {
  const brand = brandLabel(product);
  const parts = brand.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return parts.map(part => part[0]).join('').slice(0, 3).toUpperCase();
  }
  return brand.slice(0, 4).toUpperCase();
}

function stateLabel(product: CatalogProduct) {
  const text = `${product.nombre} ${product.marca ?? ''}`.toLowerCase();
  return text.includes('jbl') || text.includes('sony') ? 'MAS VENDIDO' : 'NUEVO';
}

export function ProductCard({ product }: Props) {
  const brand = brandLabel(product);
  const status = stateLabel(product);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#111111]/90 shadow-card backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-audi-red/50 hover:shadow-glow">
      <span className="pointer-events-none absolute -left-28 top-0 z-20 h-full w-24 rotate-12 bg-white/[0.16] opacity-0 blur-xl transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />

      <Link to={productPath(product)} state={{ product }} className="block" aria-label={`Ver ${product.nombre}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          <ProductImage
            product={product}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 px-2 text-[11px] font-semibold tracking-wide text-white backdrop-blur-xl">
              {brandMark(product)}
            </span>
            <span className="hidden rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[11px] font-semibold uppercase text-white/75 backdrop-blur-xl sm:inline-flex">
              {brand}
            </span>
          </div>

          <div className="absolute right-3 top-3">
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-xl',
                status === 'MAS VENDIDO'
                  ? 'bg-audi-red text-white shadow-redSoft'
                  : 'border border-white/10 bg-white/10 text-white',
              ].join(' ')}
            >
              <Sparkles className="h-3 w-3" />
              {status}
            </span>
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur-xl">
              <BadgeCheck className="h-3.5 w-3.5 text-audi-red" />
              Garantia Audi Disc
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/25 backdrop-blur-xl">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Disponible
            </span>
          </div>
        </div>
      </Link>

      <div className="p-4 sm:p-5">
        <Link to={productPath(product)} state={{ product }} className="block">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-audi-red">
            {[brand, product.categoria].filter(Boolean).join(' / ') || 'Audi Disc Sucre'}
          </p>
          <h2 className="mt-2 min-h-[52px] text-lg font-semibold leading-snug text-white">{product.nombre}</h2>
        </Link>

        <div className="mt-5 flex items-end justify-between gap-3 border-t border-white/10 pt-4">
          <div>
            <span className="block text-xs font-medium uppercase tracking-wide text-white/50">Precio local</span>
            <strong className="mt-1 block text-2xl font-semibold text-white">
              {formatBsFromCentavos(product.precioVentaCentavos)}
            </strong>
          </div>
          <Link
            to={productPath(product)}
            state={{ product }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/75 transition hover:border-audi-red hover:bg-audi-red hover:text-white"
            aria-label={`Ver detalle de ${product.nombre}`}
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>

        <ProductWhatsAppButton product={product} className="mt-4 w-full" />
      </div>
    </article>
  );
}
