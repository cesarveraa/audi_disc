import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Clock3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  PauseCircle,
  Play,
  Printer,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import type { Customer, PaymentMethod, Product, Sale } from '@audidisc/shared';
import { filterProducts, formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';
import { createCustomer, fetchCustomers } from '@features/customers/services/customersService';
import { fetchInventoryProducts } from '@features/inventory/services/inventoryService';
import { CartItemCard } from '@features/sales/components/CartItemCard';
import { PaymentModal } from '@features/sales/components/PaymentModal';
import { ProductSearchPanel } from '@features/sales/components/ProductSearchPanel';
import { generateSaleReceiptPdf } from '@features/sales/services/receiptPdf';
import { registerSale } from '@features/sales/services/salesService';
import {
  buildSalePayload,
  calculateCartTotal,
  canAddProduct,
  type CartItem,
} from '@features/sales/utils/cart';

type SaleCart = {
  id: string;
  label: string;
  items: CartItem[];
  createdAt: string;
};

function createSaleCart(label: string, items: CartItem[] = []): SaleCart {
  return {
    id: `sale-cart-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    items,
    createdAt: new Date().toISOString(),
  };
}

function playClink() {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1320, audio.currentTime + 0.08);
  gain.gain.setValueAtTime(0.001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.14);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.15);
  window.setTimeout(() => void audio.close(), 220);
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export default function POSScreen() {
  const { idToken, isAdmin, logout, user } = useRequiredAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [activeCart, setActiveCart] = useState<SaleCart>(() => createSaleCart('Venta activa'));
  const [heldCarts, setHeldCarts] = useState<SaleCart[]>([]);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [isLoadingProducts, setLoadingProducts] = useState(true);
  const [isPaymentOpen, setPaymentOpen] = useState(false);
  const [recibidoCentavos, setRecibidoCentavos] = useState(0);
  const [metodo, setMetodo] = useState<PaymentMethod>('Efectivo');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [quickPhone, setQuickPhone] = useState('');
  const [isProcessing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoadingProducts(true);
    fetchInventoryProducts({ idToken, role: user.role })
      .then(nextProducts => {
        if (mounted) {
          setProducts(nextProducts.filter(product => product.estado));
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar productos');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingProducts(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [idToken, user.role]);

  useEffect(() => {
    let mounted = true;
    fetchCustomers({ idToken, query: customerQuery })
      .then(nextCustomers => {
        if (mounted) {
          setCustomers(nextCustomers.slice(0, 6));
        }
      })
      .catch(() => {
        if (mounted) {
          setCustomers([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, [customerQuery, idToken]);

  const debouncedQuery = useDebouncedValue(query, 180);
  const filteredProducts = useMemo(
    () => filterProducts(products, debouncedQuery),
    [debouncedQuery, products],
  );
  const cart = activeCart.items;
  const totalCentavos = useMemo(() => calculateCartTotal(cart), [cart]);
  const taxCentavos = useMemo(() => Math.round(totalCentavos * 0.13), [totalCentavos]);
  const subtotalAntesImpuestoCentavos = Math.max(0, totalCentavos - taxCentavos);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  function updateCart(updater: (items: CartItem[]) => CartItem[]) {
    setActiveCart(current => ({
      ...current,
      items: updater(current.items),
    }));
  }

  function addProduct(product: Product) {
    setError(null);
    setSuccessMessage(null);
    setLastSale(null);
    if (!canAddProduct(cart, product)) {
      setError('Stock insuficiente para agregar mas unidades.');
      return;
    }

    updateCart(current => {
      const existing = current.find(item => item.product.id === product.id);
      if (!existing) {
        return [
          ...current,
          {
            product,
            quantity: 1,
            precioVendidoCentavos: product.precioVentaCentavos,
          },
        ];
      }
      return current.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      );
    });
    playClink();
    setAddedProductId(product.id);
    window.setTimeout(() => setAddedProductId(null), 450);
  }

  function increment(productId: string) {
    updateCart(current =>
      current.map(item =>
        item.product.id === productId && item.quantity < item.product.cantidad
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      ),
    );
  }

  function decrement(productId: string) {
    updateCart(current =>
      current
        .map(item =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter(item => item.quantity > 0),
    );
  }

  function remove(productId: string) {
    updateCart(current => current.filter(item => item.product.id !== productId));
  }

  function holdCurrentSale() {
    setError(null);
    setSuccessMessage(null);
    if (!cart.length) {
      setError('Agrega productos antes de poner la venta en espera.');
      return;
    }

    const label =
      activeCart.label === 'Venta activa'
        ? `Venta en Espera ${heldCarts.length + 1}`
        : activeCart.label;
    const waitingCart = { ...activeCart, label };
    setHeldCarts(current => [waitingCart, ...current.filter(item => item.id !== waitingCart.id)]);
    setActiveCart(createSaleCart('Venta activa'));
    setSuccessMessage(`${label} guardada. Puedes retomarla cuando quieras.`);
  }

  function resumeHeldSale(cartId: string) {
    const selected = heldCarts.find(item => item.id === cartId);
    if (!selected) {
      return;
    }

    setHeldCarts(current => {
      const remaining = current.filter(item => item.id !== cartId);
      if (!activeCart.items.length) {
        return remaining;
      }

      const label =
        activeCart.label === 'Venta activa'
          ? `Venta en Espera ${remaining.length + 1}`
          : activeCart.label;
      return [{ ...activeCart, label }, ...remaining];
    });
    setActiveCart(selected);
    setError(null);
    setSuccessMessage(`${selected.label} reactivada.`);
  }

  function removeHeldSale(cartId: string) {
    setHeldCarts(current => current.filter(item => item.id !== cartId));
  }

  function openPayment() {
    setError(null);
    setRecibidoCentavos(totalCentavos);
    setPaymentOpen(true);
  }

  async function createQuickCustomer() {
    if (!customerQuery.trim() || !quickPhone.trim()) {
      setError('Escribe nombre y telefono para registrar cliente.');
      return;
    }
    setError(null);
    try {
      const customer = await createCustomer({
        idToken,
        payload: { nombre: customerQuery.trim(), telefono: quickPhone.trim() },
      });
      setSelectedCustomer(customer);
      setCustomers(current => [customer, ...current]);
      setQuickPhone('');
      setSuccessMessage(`${customer.nombre} asignado a la venta.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear cliente');
    }
  }

  async function confirmSale() {
    setProcessing(true);
    setError(null);
    try {
      const payload = buildSalePayload(cart, recibidoCentavos, metodo, selectedCustomer?.id);
      const sale = await registerSale({
        idToken,
        payload,
      });

      setProducts(current =>
        current.map(product => {
          const sold = cart.find(item => item.product.id === product.id);
          if (!sold) {
            return product;
          }
          return { ...product, cantidad: Math.max(0, product.cantidad - sold.quantity) };
        }),
      );
      setActiveCart(createSaleCart('Venta activa'));
      setSelectedCustomer(null);
      setCustomerQuery('');
      setPaymentOpen(false);
      setSuccessMessage(`Venta ${sale.id} registrada. Vuelto: ${formatBsFromCentavos(sale.cambioCentavos)}.`);
      setLastSale(sale);
      void generateSaleReceiptPdf(sale).catch(() => {
        setError('Venta registrada, pero no se pudo generar el recibo PDF.');
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la venta');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(228,0,43,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7f8fa_46%,#eef0f4_100%)] text-gray-950">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-0 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="z-20 border-b border-white/60 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-3 rounded-panel border border-white/70 bg-white/55 p-3 shadow-sm backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/audidisc.jpg"
                alt="Audi Disc"
                className="h-12 w-12 rounded-2xl object-cover shadow-card"
              />
              <div className="min-w-0">
                <strong className="block truncate text-base font-semibold text-gray-950">
                  Audi Disc
                </strong>
                <span className="block truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  POS / {user.role}
                </span>
              </div>
            </div>
            <Sparkles className="h-5 w-5 text-audi-red" />
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto lg:grid lg:overflow-visible" aria-label="Principal">
            <a
              className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
              href="/inventario"
            >
              <LayoutDashboard className="h-4 w-4" />
              Inventario
            </a>
            <a
              className="flex min-w-max items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-sm transition hover:shadow-card active:scale-[0.99]"
              href="/ventas"
            >
              <span className="h-2 w-2 rounded-full bg-audi-red" />
              <CreditCard className="h-4 w-4 text-gray-500" />
              Ventas POS
            </a>
            {isAdmin && (
              <a
                className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
                href="/reportes"
              >
                <ReceiptText className="h-4 w-4" />
                Reportes
              </a>
            )}
            <a
              className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
              href="/clientes"
            >
              <UserRound className="h-4 w-4" />
              Clientes
            </a>
            <button
              className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>

          <div className="mt-6 hidden rounded-panel border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl lg:block">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950">
              <ReceiptText className="h-4 w-4 text-audi-red" />
              Cobro exacto
            </div>
            <p className="text-sm leading-6 text-gray-500">
              El backend descuenta inventario en una transaccion y guarda el precio vendido como snapshot.
            </p>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <a
                href="/inventario"
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a inventario
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">
                Punto de venta
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Nueva venta
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500">
                Busca productos, arma el carrito y cobra con vuelto calculado en centavos.
              </p>
            </div>
            <div className="rounded-panel border border-white/70 bg-white/80 p-4 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Total carrito</span>
              <strong className="mt-1 block text-3xl font-semibold text-gray-950">
                {formatBsFromCentavos(totalCentavos)}
              </strong>
              <span className="mt-1 block text-sm font-medium text-gray-500">
                {activeCart.label} / {cartCount} unidades
              </span>
              <span className="mt-1 block text-xs font-semibold text-gray-400">
                IVA estimado {formatBsFromCentavos(taxCentavos)}
              </span>
            </div>
          </header>

          {successMessage && (
            <div className="mb-5 flex flex-col gap-3 rounded-panel border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-3">
                <BadgeCheck className="h-5 w-5" />
                {successMessage}
              </span>
              {lastSale && (
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-green-800 shadow-sm transition hover:bg-green-100 active:scale-[0.98]"
                  onClick={() => void generateSaleReceiptPdf(lastSale)}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir Recibo
                </button>
              )}
            </div>
          )}
          {error && !isPaymentOpen && (
            <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">
              {error}
            </div>
          )}

          <section className="mb-5 rounded-panel border border-white/70 bg-white/75 p-4 shadow-card backdrop-blur-xl">
            <div className="grid gap-4 xl:grid-cols-[1fr_minmax(360px,0.9fr)] xl:items-start">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Venta en Espera
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-gray-950">
                    {activeCart.label}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppButton
                    variant="neutral"
                    icon={<PauseCircle className="h-4 w-4" />}
                    disabled={!cart.length}
                    onClick={holdCurrentSale}
                  >
                    Poner en espera
                  </AppButton>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                    <UserRound className="h-4 w-4 text-audi-red" />
                    Cliente de la venta
                  </div>
                  {selectedCustomer && (
                    <button className="text-xs font-bold text-audi-red" onClick={() => setSelectedCustomer(null)}>
                      Quitar
                    </button>
                  )}
                </div>
                {selectedCustomer ? (
                  <div className="rounded-2xl bg-red-50 px-4 py-3">
                    <strong className="block text-sm font-semibold text-gray-950">{selectedCustomer.nombre}</strong>
                    <span className="mt-1 block text-xs font-semibold text-gray-500">{selectedCustomer.telefono}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 rounded-2xl border border-gray-100 px-3 py-2">
                      <Search className="h-4 w-4 text-gray-400" />
                      <input
                        value={customerQuery}
                        onChange={event => setCustomerQuery(event.target.value)}
                        placeholder="Buscar cliente"
                        className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                      />
                    </div>
                    <div className="mt-2 grid gap-1">
                      {customers.map(customer => (
                        <button
                          key={customer.id}
                          className="rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-950"
                          onClick={() => setSelectedCustomer(customer)}
                        >
                          {customer.nombre} / {customer.telefono}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={quickPhone}
                        onChange={event => setQuickPhone(event.target.value)}
                        placeholder="Telefono nuevo"
                        className="h-10 rounded-2xl border border-gray-100 px-3 text-sm font-semibold outline-none focus:border-audi-red"
                      />
                      <AppButton variant="ghost" onClick={() => void createQuickCustomer()}>
                        Crear y asignar
                      </AppButton>
                    </div>
                  </>
                )}
              </div>
            </div>

            {heldCarts.length > 0 && (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {heldCarts.map(waitingCart => (
                  <article
                    key={waitingCart.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                        <Clock3 className="h-4 w-4 text-audi-red" />
                        <span className="truncate">{waitingCart.label}</span>
                      </div>
                      <span className="mt-1 block text-xs font-medium text-gray-500">
                        {waitingCart.items.reduce((total, item) => total + item.quantity, 0)} unidades /{' '}
                        {formatBsFromCentavos(calculateCartTotal(waitingCart.items))}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-950 text-white transition hover:bg-gray-800 active:scale-95"
                        onClick={() => resumeHeldSale(waitingCart.id)}
                        aria-label={`Reactivar ${waitingCart.label}`}
                      >
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-500 transition hover:bg-audi-red hover:text-white active:scale-95"
                        onClick={() => removeHeldSale(waitingCart.id)}
                        aria-label={`Eliminar ${waitingCart.label}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
            <ProductSearchPanel
              products={filteredProducts}
              query={query}
              isSearching={query !== debouncedQuery}
              addedProductId={addedProductId}
              onQueryChange={setQuery}
              onAddProduct={addProduct}
            />

            <section className="rounded-panel border border-white/70 bg-white/75 p-4 shadow-card backdrop-blur-xl sm:p-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:overflow-y-auto">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Carrito
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950">Productos seleccionados</h2>
                </div>
                <AppButton
                  variant="ghost"
                  icon={<Trash2 className="h-4 w-4" />}
                  disabled={!cart.length}
                  onClick={() => updateCart(() => [])}
                >
                  Limpiar
                </AppButton>
              </div>

              {isLoadingProducts && (
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-500">
                  Cargando productos...
                </div>
              )}

              <div className="grid gap-3">
                {cart.map(item => (
                  <CartItemCard
                    key={item.product.id}
                    item={item}
                    onIncrement={increment}
                    onDecrement={decrement}
                    onRemove={remove}
                  />
                ))}

                {!cart.length && (
                  <div className="grid min-h-[280px] place-items-center rounded-panel border border-dashed border-gray-200 bg-white/70 p-8 text-center">
                    <div>
                      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gray-100 text-gray-500">
                        <ShoppingBag className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-950">Carrito listo</h3>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">
                        Agrega productos desde el buscador lateral para iniciar la venta.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <footer className="mt-5 rounded-panel bg-gray-950 p-5 text-white">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div>
                    <span className="text-sm font-semibold text-white/70">Total a pagar</span>
                    <strong className="mt-1 block text-4xl font-semibold tracking-tight">
                      {formatBsFromCentavos(totalCentavos)}
                    </strong>
                    <div className="mt-3 grid max-w-md gap-2 text-sm font-semibold text-white/70 sm:grid-cols-2">
                      <span>Subtotal {formatBsFromCentavos(subtotalAntesImpuestoCentavos)}</span>
                      <span>IVA estimado {formatBsFromCentavos(taxCentavos)}</span>
                    </div>
                  </div>
                  <AppButton
                    variant="primary"
                    className="h-14 min-w-52 text-base"
                    disabled={!cart.length}
                    onClick={openPayment}
                  >
                    Finalizar Compra
                  </AppButton>
                </div>
              </footer>
            </section>
          </div>
        </section>
      </div>

      <PaymentModal
        open={isPaymentOpen}
        totalCentavos={totalCentavos}
        recibidoCentavos={recibidoCentavos}
        metodo={metodo}
        isProcessing={isProcessing}
        error={error}
        onRecibidoChange={setRecibidoCentavos}
        onMetodoChange={setMetodo}
        onClose={() => {
          if (!isProcessing) {
            setPaymentOpen(false);
            setError(null);
          }
        }}
        onConfirm={confirmSale}
      />
    </main>
  );
}
