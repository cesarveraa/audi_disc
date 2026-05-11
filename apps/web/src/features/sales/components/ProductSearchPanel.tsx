import { Search, ShoppingCart } from 'lucide-react';
import type { Product } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

type Props = {
  products: Product[];
  query: string;
  isSearching: boolean;
  addedProductId: string | null;
  onQueryChange: (query: string) => void;
  onAddProduct: (product: Product) => void;
};

function productImage(product: Product): string {
  const key = `${product.nombre} ${product.categoria ?? ''}`.toLowerCase();
  if (key.includes('parlante')) {
    return 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=300&q=84&fm=webp';
  }
  if (key.includes('cable')) {
    return 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=300&q=84&fm=webp';
  }
  if (key.includes('micro')) {
    return 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=300&q=84&fm=webp';
  }
  return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=300&q=84&fm=webp';
}

export function ProductSearchPanel({
  products,
  query,
  isSearching,
  addedProductId,
  onQueryChange,
  onAddProduct,
}: Props) {
  return (
    <aside className="rounded-panel border border-white/70 bg-white/80 p-4 shadow-card backdrop-blur-xl xl:sticky xl:top-6 xl:h-[calc(100vh-48px)]">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
          Productos
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-gray-950">Buscar y vender</h2>
      </div>

      <label className="mb-4 flex h-12 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 shadow-sm focus-within:border-gray-400">
        <Search className="h-5 w-5 text-gray-400" />
        <input
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder="Nombre, marca o SKU"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-gray-950 outline-none placeholder:text-gray-400"
        />
      </label>

      {isSearching && (
        <div className="mb-3 rounded-2xl bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500">
          Actualizando busqueda...
        </div>
      )}

      <div className="grid max-h-[calc(100vh-220px)] gap-3 overflow-y-auto pr-1">
        {products.map(product => {
          const disabled = !product.estado || product.cantidad <= 0;
          const justAdded = addedProductId === product.id;
          return (
            <button
              key={product.id}
              className={[
                'flex w-full items-center gap-3 rounded-[18px] border p-2 text-left transition duration-200 active:scale-[0.99]',
                justAdded
                  ? 'border-audi-red bg-audi-red text-white shadow-button'
                  : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-card',
                disabled ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
              disabled={disabled}
              onClick={() => onAddProduct(product)}
            >
              <img
                src={productImage(product)}
                alt={product.nombre}
                className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                loading="lazy"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold">{product.nombre}</strong>
                <span className={justAdded ? 'block truncate text-xs text-white/80' : 'block truncate text-xs text-gray-500'}>
                  {product.marca ?? 'Sin marca'} / stock {product.cantidad}
                </span>
                <span className={justAdded ? 'mt-1 block text-sm font-semibold text-white' : 'mt-1 block text-sm font-semibold text-gray-950'}>
                  {formatBsFromCentavos(product.precioVentaCentavos)}
                </span>
              </span>
              <span className={justAdded ? 'grid h-9 w-9 place-items-center rounded-2xl bg-white/15' : 'grid h-9 w-9 place-items-center rounded-2xl bg-gray-100 text-gray-700'}>
                <ShoppingCart className="h-4 w-4" />
              </span>
            </button>
          );
        })}

        {!products.length && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-500">
            No hay productos para esa busqueda.
          </div>
        )}
      </div>
    </aside>
  );
}
