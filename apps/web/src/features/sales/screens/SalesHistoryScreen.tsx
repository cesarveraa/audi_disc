import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { SalesHistory } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';
import { fetchSalesHistory, voidSale } from '@features/reports/services/reportsService';

function localDateIso(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function SalesHistoryScreen() {
  const { idToken, isAdmin, logout, user } = useRequiredAuth();
  const [dateFrom, setDateFrom] = useState(() => localDateIso(6));
  const [dateTo, setDateTo] = useState(() => localDateIso());
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [saleToVoid, setSaleToVoid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextHistory = await fetchSalesHistory({
        idToken,
        role: user.role,
        dateFrom,
        dateTo,
      });
      setHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar ventas pasadas');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, idToken, user.role]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const utilidad = useMemo(
    () =>
      history?.ventas.reduce(
        (sum, sale) =>
          sum + sale.productos.reduce((itemSum, item) => itemSum + (item.utilidadCentavos ?? 0), 0),
        0,
      ) ?? 0,
    [history],
  );

  async function handleVoid(saleId: string) {
    if (!isAdmin) {
      return;
    }

    setVoidingId(saleId);
    setError(null);
    try {
      await voidSale({ idToken, saleId });
      setSaleToVoid(null);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la venta');
    } finally {
      setVoidingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(228,0,43,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7f8fa_46%,#eef0f4_100%)] text-gray-950">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-0 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="z-20 border-b border-white/60 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="rounded-panel border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-xl">
            <strong className="block text-base font-semibold text-gray-950">Audi Disc</strong>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Ventas Pasadas / {user.role}
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
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/reportes">
              <ReceiptText className="h-4 w-4" />
              Reportes
            </a>
            <a className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-sm" href="/historial">
              <span className="h-2 w-2 rounded-full bg-audi-red" />
              <ShieldCheck className="h-4 w-4 text-gray-500" />
              Ventas Pasadas
            </a>
            <button
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <a href="/reportes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950">
                <ArrowLeft className="h-4 w-4" />
                Volver a reportes
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">
                RegistroDias
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Ventas Pasadas
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500">
                Consulta historica con anulacion transaccional protegida por Administrador.
              </p>
            </div>
            <div className="rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white shadow-button">
              RBAC Admin activo
            </div>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="grid gap-3 rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur-xl sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-gray-600">
                Desde
                <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-12 rounded-2xl border border-gray-200 px-3" />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-gray-600">
                Hasta
                <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-12 rounded-2xl border border-gray-200 px-3" />
              </label>
            </div>
            <AppButton variant="primary" icon={<CalendarRange className="h-4 w-4" />} isLoading={isLoading} onClick={() => void loadHistory()}>
              Consultar rango
            </AppButton>
          </section>

          <section className="mb-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Total rango</span>
              <strong className="mt-2 block text-3xl font-semibold">{formatBsFromCentavos(history?.totalCentavos ?? 0)}</strong>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-sm backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Ventas</span>
              <strong className="mt-2 block text-3xl font-semibold">{history?.cantidadVentas ?? 0}</strong>
            </article>
            <article className="rounded-2xl bg-gray-950 p-5 text-white shadow-sm">
              <span className="text-sm font-semibold text-white/70">Utilidad</span>
              <strong className="mt-2 block text-3xl font-semibold">{formatBsFromCentavos(utilidad)}</strong>
            </article>
          </section>

          <section className="overflow-hidden rounded-panel border border-white/70 bg-white/85 shadow-card backdrop-blur-xl">
            {(history?.ventas ?? []).map(sale => (
              <article key={sale.id} className="grid gap-4 border-b border-gray-100 p-5 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-lg font-semibold text-gray-950">{sale.id}</strong>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                      {sale.fechaLocal} / {sale.horaLocal}
                    </span>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-audi-red">
                      {sale.metodo}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm font-medium text-gray-600">
                    {sale.productos.map(item => (
                      <span key={`${sale.id}-${item.productoId}`} className="rounded-2xl border border-gray-100 bg-white px-3 py-2">
                        {item.nombre} x{item.cantidad}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
                  <div className="text-left sm:text-right">
                    <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Total</span>
                    <strong className="block text-xl font-semibold text-gray-950">{formatBsFromCentavos(sale.totalCentavos)}</strong>
                  </div>
                  {isAdmin && (
                    <AppButton
                      variant="neutral"
                      icon={<RotateCcw className="h-4 w-4" />}
                      isLoading={voidingId === sale.id}
                      onClick={() => setSaleToVoid(sale.id)}
                    >
                      Anular
                    </AppButton>
                  )}
                </div>
              </article>
            ))}
            {!(history?.ventas.length) && (
              <div className="p-10 text-center text-sm font-semibold text-gray-500">
                Sin ventas activas en el rango seleccionado.
              </div>
            )}
          </section>
        </section>
      </div>

      {saleToVoid && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-gray-950/45 px-4 backdrop-blur-sm">
          <section
            className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar anulacion de venta"
          >
            <div className="bg-audi-red p-5 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                    Accion irreversible
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Anular venta</h2>
                </div>
                <button
                  className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-white transition hover:bg-white/25"
                  onClick={() => setSaleToVoid(null)}
                  aria-label="Cerrar modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm leading-6 text-gray-600">
                Se marcara la venta <strong className="text-gray-950">{saleToVoid}</strong> como inactiva y
                el backend devolvera las cantidades al inventario en una transaccion atomica.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <AppButton variant="neutral" onClick={() => setSaleToVoid(null)}>
                  Cancelar
                </AppButton>
                <AppButton
                  variant="primary"
                  icon={<RotateCcw className="h-4 w-4" />}
                  isLoading={voidingId === saleToVoid}
                  onClick={() => void handleVoid(saleToVoid)}
                >
                  Confirmar anulacion
                </AppButton>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
