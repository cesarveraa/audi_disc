import type { CatalogProduct } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';
import { BadgeCheck, CheckCircle2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { productPath } from '../utils/catalog';
import { ProductImage } from './ProductImage';
import { ProductWhatsAppButton } from './WhatsAppButton';

type Props = {
  product: CatalogProduct;
};

export function ProductCard({ product }: Props) {
  return (
    <article className="group overflow-hidden rounded-lg border border-white/10 bg-catalog-card shadow-card transition duration-300 hover:scale-[1.03] hover:border-audi-red/50 hover:shadow-redSoft">
      <Link to={productPath(product)} state={{ product }} className="block" aria-label={`Ver ${product.nombre}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          <ProductImage
            product={product}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-black/75 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/10 backdrop-blur">
              <BadgeCheck className="h-3.5 w-3.5 text-audi-red" />
              Garantía Audi Disc
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/25 backdrop-blur">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Disponible
            </span>
          </div>
        </div>
      </Link>

      <div className="p-4">
        <Link to={productPath(product)} state={{ product }} className="block">
          <p className="text-xs font-semibold uppercase text-audi-red">
            {[product.marca, product.categoria].filter(Boolean).join(' / ') || 'Audi Disc'}
          </p>
          <h2 className="mt-2 min-h-[52px] text-lg font-semibold leading-snug text-catalog-text">
            {product.nombre}
          </h2>
        </Link>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/10 pt-4">
          <div>
            <span className="block text-xs font-medium text-catalog-muted">Precio local</span>
            <strong className="mt-1 block text-xl font-semibold text-white">
              {formatBsFromCentavos(product.precioVentaCentavos)}
            </strong>
          </div>
          <Link
            to={productPath(product)}
            state={{ product }}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/70 transition hover:border-audi-red hover:bg-audi-red hover:text-white"
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
