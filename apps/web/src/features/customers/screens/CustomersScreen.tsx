import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Phone,
  Plus,
  ReceiptText,
  Search,
  UserRound,
} from 'lucide-react';
import type { Customer, CustomerSalesHistory } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';
import {
  createCustomer,
  fetchCustomers,
  fetchCustomerSales,
} from '@features/customers/services/customersService';

export default function CustomersScreen() {
  const { idToken, isAdmin, logout, user } = useRequiredAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerSalesHistory | null>(null);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [isLoading, setLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchCustomers({ idToken, query })
      .then(nextCustomers => {
        if (mounted) {
          setCustomers(nextCustomers);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar clientes');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [idToken, query]);

  useEffect(() => {
    if (!selectedCustomer) {
      setHistory(null);
      return;
    }
    let mounted = true;
    fetchCustomerSales({ idToken, customerId: selectedCustomer.id })
      .then(nextHistory => {
        if (mounted) {
          setHistory(nextHistory);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar historial');
        }
      });
    return () => {
      mounted = false;
    };
  }, [idToken, selectedCustomer]);

  const summary = useMemo(() => {
    const total = customers.reduce((sum, customer) => sum + customer.totalCompradoCentavos, 0);
    const active = customers.filter(customer => customer.estado).length;
    return { total, active };
  }, [customers]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const customer = await createCustomer({
        idToken,
        payload: { nombre, telefono },
      });
      setCustomers(current => [customer, ...current]);
      setSelectedCustomer(customer);
      setNombre('');
      setTelefono('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar cliente');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(228,0,43,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7f8fa_46%,#eef0f4_100%)] text-gray-950">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="z-20 border-b border-white/60 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="rounded-panel border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-xl">
            <strong className="block text-base font-semibold text-gray-950">Audi Disc</strong>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              CRM / {user.role}
            </span>
          </div>
          <nav className="mt-5 grid gap-2" aria-label="Principal">
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/inventario">
              <LayoutDashboard className="h-4 w-4" />
              Inventario
            </a>
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/ventas">
              <CreditCard className="h-4 w-4" />
              Ventas POS
            </a>
            <a className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-sm" href="/clientes">
              <span className="h-2 w-2 rounded-full bg-audi-red" />
              <UserRound className="h-4 w-4 text-gray-500" />
              Clientes
            </a>
            {isAdmin && (
              <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/reportes">
                <ReceiptText className="h-4 w-4" />
                Reportes
              </a>
            )}
            <button className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <a href="/inventario" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">CRM Premium</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">Clientes</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500">
                Registra compradores, vincula ventas y consulta historial sin perder velocidad en caja.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-panel border border-white/70 bg-white/85 p-4 shadow-card">
                <span className="text-sm font-semibold text-gray-500">Clientes activos</span>
                <strong className="mt-1 block text-3xl font-semibold">{summary.active}</strong>
              </article>
              <article className="rounded-panel bg-audi-red p-4 text-white shadow-button">
                <span className="text-sm font-semibold text-white/80">Valor CRM</span>
                <strong className="mt-1 block text-3xl font-semibold">{formatBsFromCentavos(summary.total)}</strong>
              </article>
            </div>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <section className="rounded-panel border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3">
                <Search className="h-5 w-5 text-gray-400" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Buscar por nombre o telefono"
                  className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                />
              </div>

              <div className="grid gap-3">
                {customers.map(customer => (
                  <button
                    key={customer.id}
                    className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${selectedCustomer?.id === customer.id ? 'border-audi-red bg-red-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-lg font-semibold text-gray-950">{customer.nombre}</strong>
                        <span className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-500">
                          <Phone className="h-4 w-4" />
                          {customer.telefono}
                        </span>
                      </div>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                        {customer.comprasCount} compras
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm font-semibold text-gray-500">
                      <span>Total historico</span>
                      <span className="text-gray-950">{formatBsFromCentavos(customer.totalCompradoCentavos)}</span>
                    </div>
                  </button>
                ))}
                {!customers.length && (
                  <div className="rounded-panel border border-dashed border-gray-200 bg-white p-8 text-center text-sm font-semibold text-gray-500">
                    {isLoading ? 'Cargando clientes...' : 'Sin clientes registrados.'}
                  </div>
                )}
              </div>
            </section>

            <aside className="grid gap-5">
              <form className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl" onSubmit={event => void handleSubmit(event)}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Nuevo cliente</p>
                    <h2 className="mt-1 text-2xl font-semibold text-gray-950">Registro rapido</h2>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-audi-red text-white">
                    <Plus className="h-5 w-5" />
                  </span>
                </div>
                <label className="grid gap-2 text-sm font-semibold text-gray-600">
                  Nombre
                  <input value={nombre} onChange={event => setNombre(event.target.value)} required maxLength={120} className="h-12 rounded-2xl border border-gray-200 px-4 outline-none focus:border-audi-red" />
                </label>
                <label className="mt-3 grid gap-2 text-sm font-semibold text-gray-600">
                  Telefono
                  <input value={telefono} onChange={event => setTelefono(event.target.value)} required maxLength={32} className="h-12 rounded-2xl border border-gray-200 px-4 outline-none focus:border-audi-red" />
                </label>
                <AppButton className="mt-4 w-full justify-center" variant="primary" isLoading={isSaving}>
                  Registrar cliente
                </AppButton>
              </form>

              <section className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Historial</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">
                  {selectedCustomer ? selectedCustomer.nombre : 'Selecciona un cliente'}
                </h2>
                <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                  <span className="text-sm font-semibold text-gray-500">Total comprado</span>
                  <strong className="mt-1 block text-2xl font-semibold">
                    {formatBsFromCentavos(history?.totalCentavos ?? 0)}
                  </strong>
                </div>
                <div className="mt-4 grid max-h-[420px] gap-3 overflow-auto pr-1">
                  {(history?.ventas ?? []).map(sale => (
                    <article key={sale.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="font-semibold text-gray-950">{sale.fechaLocal}</strong>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-audi-red">
                          {formatBsFromCentavos(sale.totalCentavos)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-gray-500">
                        {sale.productos.map(item => `${item.nombre} x${item.cantidad}`).join(' / ')}
                      </p>
                    </article>
                  ))}
                  {selectedCustomer && !(history?.ventas.length) && (
                    <div className="rounded-2xl bg-gray-50 p-5 text-center text-sm font-semibold text-gray-500">
                      Este cliente aun no tiene compras vinculadas.
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
