import { useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCw, ScanBarcode, SlidersHorizontal, SquarePen } from 'lucide-react';
import type { InventoryUpdateInput, Product, ProductCreateInput, ProductUpdateInput } from '@audidisc/shared';
import { formatBsFromCentavos, hasAdminFinancials } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppSidebar } from '@app/navigation/AppSidebar';
import { AppButton } from '@core/ui/AppButton';
import { MobilePullToRefresh } from '@core/ui/MobilePullToRefresh';
import { findProductByBarcode, scanBarcodeValue } from '@features/barcode/barcodeScanner';
import { CommandPalette } from '@features/inventory/components/CommandPalette';
import { DashboardSummary } from '@features/inventory/components/DashboardSummary';
import { ProductFormModal } from '@features/inventory/components/ProductFormModal';
import { SearchBar } from '@features/inventory/components/SearchBar';
import { StockUpdateModal } from '@features/inventory/components/StockUpdateModal';
import { useInventory } from '@features/inventory/hooks/useInventory';
import {
  createInventoryProduct,
  updateInventoryProduct,
  updateInventoryStock,
} from '@features/inventory/services/inventoryService';

type StockFilter = 'all' | 'low' | 'out' | 'healthy';

function stockBadge(product: Product) {
  if (product.cantidad <= 0) {
    return { label: 'Agotado', className: 'bg-audi-red text-white' };
  }
  if (product.cantidad < 5) {
    return { label: 'Bajo <5', className: 'bg-audi-red text-white' };
  }
  if (product.cantidad <= product.stockMinimo) {
    return { label: 'Minimo', className: 'bg-gray-950 text-white' };
  }
  return { label: 'OK', className: 'bg-gray-100 text-gray-700' };
}

export default function InventoryScreen() {
  const { canAccess, canViewFinancials, idToken, logout, user } = useRequiredAuth();
  const canManageInventory = canAccess('inventory_write');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setProductModalOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isScanning, setScanning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    dashboard,
    products,
    filteredProducts,
    query,
    setQuery,
    isLoading,
    error,
    refresh,
  } = useInventory();

  function handleNewProduct() {
    setActionError(null);
    setEditingProduct(null);
    setProductModalOpen(true);
  }

  function handleEditProduct(product: Product) {
    setActionError(null);
    setEditingProduct(product);
    setProductModalOpen(true);
  }

  async function handleProductSubmit(payload: ProductCreateInput | ProductUpdateInput) {
    setSaving(true);
    setActionError(null);
    try {
      if (editingProduct) {
        await updateInventoryProduct({
          idToken,
          productId: editingProduct.id,
          payload: payload as ProductUpdateInput,
        });
      } else {
        await createInventoryProduct({
          idToken,
          payload: payload as ProductCreateInput,
        });
      }
      setProductModalOpen(false);
      setEditingProduct(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar el producto');
    } finally {
      setSaving(false);
    }
  }

  async function handleStockSubmit(payload: InventoryUpdateInput) {
    setSaving(true);
    setActionError(null);
    try {
      await updateInventoryStock({ idToken, payload });
      setStockProduct(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo ajustar el stock');
    } finally {
      setSaving(false);
    }
  }

  async function handleBarcodeScan() {
    setScanning(true);
    setActionError(null);
    try {
      const code = await scanBarcodeValue();
      const product = findProductByBarcode(products, code);
      if (!product) {
        setQuery(code);
        setActionError(`No encontre un producto con el codigo ${code}. Revise SKU o busqueda.`);
        return;
      }
      setQuery(product.sku ?? product.nombre);
      if (canManageInventory) {
        setEditingProduct(product);
        setProductModalOpen(true);
      } else {
        setActionError(`Producto encontrado: ${product.nombre}. Tu rol no puede abrir la ficha de edicion.`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo escanear el codigo');
    } finally {
      setScanning(false);
    }
  }

  const categories = useMemo(() => {
    const values = new Set<string>();
    filteredProducts.forEach(product => {
      if (product.categoria) {
        values.add(product.categoria);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [filteredProducts]);

  const visibleProducts = useMemo(
    () =>
      filteredProducts.filter(product => {
        if (categoryFilter !== 'all' && product.categoria !== categoryFilter) {
          return false;
        }
        if (stockFilter === 'low') {
          return product.cantidad > 0 && product.cantidad < 5;
        }
        if (stockFilter === 'out') {
          return product.cantidad <= 0;
        }
        if (stockFilter === 'healthy') {
          return product.cantidad >= 5;
        }
        return true;
      }),
    [categoryFilter, filteredProducts, stockFilter],
  );

  function closeProductModal() {
    if (isSaving) {
      return;
    }
    setProductModalOpen(false);
    setEditingProduct(null);
    setActionError(null);
  }

  function closeStockModal() {
    if (isSaving) {
      return;
    }
    setStockProduct(null);
    setActionError(null);
  }

  return (
    <main className="ad-page">
      <MobilePullToRefresh disabled={isLoading || isSaving} onRefresh={refresh} />
      <div className="ad-shell">
        <AppSidebar active="inventory" user={user} onLogout={logout} />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">
                Audi Disc
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Premium Sales Experience
              </h1>
              <p className="mt-4 text-base leading-7 text-gray-500">
                Inventario visual, busqueda instantanea, alertas criticas y operaciones listas para caja.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CommandPalette isAdmin={canManageInventory} onQueryChange={setQuery} onNewProduct={handleNewProduct} />
              <AppButton
                variant="neutral"
                icon={<ScanBarcode className="h-4 w-4" />}
                isLoading={isScanning}
                onClick={() => void handleBarcodeScan()}
              >
                Escanear con Camara
              </AppButton>
              <AppButton
                variant="neutral"
                onClick={() => void refresh()}
                isLoading={isLoading}
                icon={<RefreshCw className="h-4 w-4" />}
              >
                Actualizar
              </AppButton>
              {canManageInventory && (
                <AppButton
                  variant="primary"
                  onClick={handleNewProduct}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Nuevo producto
                </AppButton>
              )}
            </div>
          </header>

          <DashboardSummary dashboard={dashboard} />

          <section className="mt-8 rounded-panel border border-white/70 bg-white/70 p-4 shadow-card backdrop-blur-xl sm:p-5">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Catalogo activo
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">Inventario</h2>
              </div>
              <SearchBar
                query={query}
                onQueryChange={setQuery}
                resultCount={visibleProducts.length}
              />
            </div>

            <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-10 items-center gap-2 rounded-2xl bg-white px-3 text-sm font-semibold text-gray-500 shadow-sm">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtros
                </span>
                {([
                  ['all', 'Todos'],
                  ['low', 'Bajo <5'],
                  ['out', 'Agotados'],
                  ['healthy', 'Saludable'],
                ] as [StockFilter, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    className={[
                      'h-10 rounded-2xl px-4 text-sm font-semibold transition active:scale-[0.98]',
                      stockFilter === value
                        ? 'bg-gray-950 text-white shadow-sm'
                        : 'bg-white text-gray-600 shadow-sm hover:text-gray-950',
                    ].join(' ')}
                    onClick={() => setStockFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                value={categoryFilter}
                onChange={event => setCategoryFilter(event.target.value)}
                className="h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm outline-none focus:border-audi-red"
              >
                <option value="all">Todas las categorias</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="mb-4 rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">
                {error}
              </div>
            )}
            {actionError && !isProductModalOpen && !stockProduct && (
              <div className="mb-4 rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">
                {actionError}
              </div>
            )}
            {isLoading && (
              <div className="mb-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-500">
                Cargando inventario...
              </div>
            )}

            <div className="overflow-hidden rounded-panel border border-gray-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-left">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-right">Venta</th>
                      {canViewFinancials && <th className="px-4 py-3 text-right">Costo</th>}
                      <th className="px-4 py-3 text-right">Estado</th>
                      {canManageInventory && <th className="px-4 py-3 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visibleProducts.map(product => {
                      const badge = stockBadge(product);
                      return (
                        <tr key={product.id} className="transition hover:bg-gray-50/80">
                          <td className="min-w-64 px-4 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <img
                                src="/audidisc.jpg"
                                alt=""
                                className="h-11 w-11 rounded-xl object-cover"
                              />
                              <div className="min-w-0">
                                <strong className="block truncate text-sm font-semibold text-gray-950">
                                  {product.nombre}
                                </strong>
                                <span className="mt-1 block truncate text-xs font-semibold text-gray-500">
                                  {product.marca ?? 'Sin marca'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-500">
                            {product.sku ?? 'Sin SKU'}
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-gray-600">
                            {product.categoria ?? 'Sin categoria'}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <strong className={product.cantidad < 5 ? 'text-lg font-semibold text-audi-red' : 'text-lg font-semibold text-gray-950'}>
                              {product.cantidad}
                            </strong>
                            <span className="ml-2 text-xs font-semibold text-gray-400">
                              min {product.stockMinimo}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-sm font-semibold text-gray-950">
                            {formatBsFromCentavos(product.precioVentaCentavos)}
                          </td>
                          {canViewFinancials && (
                            <td className="px-4 py-4 text-right text-sm font-semibold text-gray-500">
                              {hasAdminFinancials(product)
                                ? formatBsFromCentavos(product.precioCompraCentavos)
                                : '-'}
                            </td>
                          )}
                          <td className="px-4 py-4 text-right">
                            <span className={`inline-flex min-w-20 justify-center rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </td>
                          {canManageInventory && (
                            <td className="px-4 py-4">
                              <div className="flex justify-end gap-2">
                                <button
                                  className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-600 transition hover:bg-gray-950 hover:text-white active:scale-95"
                                  onClick={() => handleEditProduct(product)}
                                  aria-label={`Editar ${product.nombre}`}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  className="grid h-10 w-10 place-items-center rounded-2xl bg-red-50 text-audi-red transition hover:bg-audi-red hover:text-white active:scale-95"
                                  onClick={() => {
                                    setActionError(null);
                                    setStockProduct(product);
                                  }}
                                  aria-label={`Ajustar stock de ${product.nombre}`}
                                >
                                  <SquarePen className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!visibleProducts.length && (
                <div className="p-8 text-center text-sm font-semibold text-gray-500">
                  Sin productos para los filtros seleccionados.
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
      <ProductFormModal
        open={isProductModalOpen}
        product={editingProduct}
        isSaving={isSaving}
        apiError={isProductModalOpen ? actionError : null}
        onClose={closeProductModal}
        onSubmit={handleProductSubmit}
      />
      <StockUpdateModal
        product={stockProduct}
        isSaving={isSaving}
        apiError={stockProduct ? actionError : null}
        onClose={closeStockModal}
        onSubmit={handleStockSubmit}
      />
    </main>
  );
}
