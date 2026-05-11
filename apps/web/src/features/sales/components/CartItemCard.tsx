import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatBsFromCentavos } from '@audidisc/shared';

import type { CartItem } from '@features/sales/utils/cart';

type Props = {
  item: CartItem;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
};

export function CartItemCard({ item, onIncrement, onDecrement, onRemove }: Props) {
  const product = item.product;
  const subtotal = item.quantity * item.precioVendidoCentavos;
  const canIncrement = item.quantity < product.cantidad;

  return (
    <article className="rounded-panel border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-950">{product.nombre}</h3>
          <p className="mt-1 text-sm font-medium text-gray-500">
            {product.marca ?? 'Sin marca'} / {formatBsFromCentavos(item.precioVendidoCentavos)}
          </p>
        </div>
        <button
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gray-50 text-gray-500 transition hover:bg-audi-red hover:text-white active:scale-95"
          onClick={() => onRemove(product.id)}
          aria-label={`Quitar ${product.nombre}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center rounded-2xl border border-gray-200 bg-gray-50 p-1">
          <button
            className="grid h-10 w-10 place-items-center rounded-xl bg-white text-gray-700 shadow-sm transition hover:bg-gray-100 active:scale-95"
            onClick={() => onDecrement(product.id)}
            aria-label={`Disminuir ${product.nombre}`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="grid h-10 min-w-12 place-items-center px-3 text-base font-semibold text-gray-950">
            {item.quantity}
          </span>
          <button
            className="grid h-10 w-10 place-items-center rounded-xl bg-gray-950 text-white shadow-sm transition hover:bg-gray-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onIncrement(product.id)}
            disabled={!canIncrement}
            aria-label={`Aumentar ${product.nombre}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="text-right">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Subtotal
          </span>
          <strong className="text-lg font-semibold text-gray-950">
            {formatBsFromCentavos(subtotal)}
          </strong>
        </div>
      </div>
    </article>
  );
}

