import { MoreHorizontal, ShieldCheck } from 'lucide-react';
import type { Product } from '@audidisc/shared';
import { formatBsFromCentavos, hasAdminFinancials } from '@audidisc/shared';

import {
  canDisplayFinancials,
  getStockLabel,
} from '@features/inventory/utils/inventoryView';

type Props = {
  product: Product;
  isAdmin: boolean;
};

function stockClass(product: Product): string {
  const label = getStockLabel(product);
  if (label === 'Critico') {
    return 'bg-audi-red text-white';
  }
  if (label === 'Bajo') {
    return 'bg-gray-950 text-white';
  }
  if (label === 'Inactivo') {
    return 'bg-gray-100 text-gray-600';
  }
  return 'bg-gray-100 text-gray-700';
}

function productImage(product: Product): string {
  const key = `${product.nombre} ${product.categoria ?? ''}`.toLowerCase();
  if (key.includes('parlante')) {
    return 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=900&q=88&fm=webp';
  }
  if (key.includes('cable')) {
    return 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=900&q=88&fm=webp';
  }
  if (key.includes('micro')) {
    return 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=88&fm=webp';
  }
  return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=88&fm=webp';
}

export function InventoryCard({ product, isAdmin }: Props) {
  const showFinancials = canDisplayFinancials(product, isAdmin);

  return (
    <article className="group overflow-hidden rounded-panel border border-white/70 bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-luxury">
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        <picture>
          <source srcSet={productImage(product)} type="image/webp" />
          <img
            src={productImage(product)}
            alt={product.nombre}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/30 via-transparent to-transparent" />
        <button
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-2xl border border-white/60 bg-white/80 text-gray-700 shadow-sm backdrop-blur transition hover:bg-white active:scale-95"
          aria-label={`Acciones para ${product.nombre}`}
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight text-gray-950">{product.nombre}</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              {[product.marca, product.categoria].filter(Boolean).join(' / ') || 'Sin categoria'}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${stockClass(product)}`}>
            {getStockLabel(product)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Stock</span>
            <strong className="mt-1 block text-lg font-semibold text-gray-950">{product.cantidad}</strong>
          </div>
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Minimo</span>
            <strong className="mt-1 block text-lg font-semibold text-gray-950">{product.stockMinimo}</strong>
          </div>
          <div className="rounded-2xl bg-gray-50 p-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Venta</span>
            <strong className="mt-1 block break-words text-sm font-semibold text-gray-950">
              {formatBsFromCentavos(product.precioVentaCentavos)}
            </strong>
          </div>
        </div>

        {showFinancials && hasAdminFinancials(product) && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-[18px] border border-gray-100 bg-gray-50 p-2" aria-label="Datos financieros">
            <div className="rounded-2xl bg-white p-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Costo</span>
              <strong className="mt-1 block break-words text-sm font-semibold text-gray-950">
                {formatBsFromCentavos(product.precioCompraCentavos)}
              </strong>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Utilidad</span>
              <strong className="mt-1 block break-words text-sm font-semibold text-gray-950">
                {formatBsFromCentavos(product.utilidadCentavos)}
              </strong>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Margen</span>
              <strong className="mt-1 block text-sm font-semibold text-gray-950">
                {product.margenPorcentaje.toFixed(2)}%
              </strong>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-4 text-sm font-semibold text-gray-500">
          <span className="truncate">{product.sku ?? 'Sin SKU'}</span>
          {isAdmin && (
            <span className="inline-flex items-center gap-1 text-gray-700">
              <ShieldCheck className="h-4 w-4" />
              Admin
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
