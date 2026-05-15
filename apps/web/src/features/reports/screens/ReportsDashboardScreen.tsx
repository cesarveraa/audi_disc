import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarRange,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  Trophy,
  UsersRound,
} from 'lucide-react';
import type { ReportsDashboard, SalesHistory } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';
import { WeeklyRevenueChart } from '@features/reports/components/WeeklyRevenueChart';
import { YearComparisonChart } from '@features/reports/components/YearComparisonChart';
import {
  downloadCashClosePdf,
  fetchReportsDashboard,
  fetchSalesHistory,
} from '@features/reports/services/reportsService';

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function ReportsDashboardScreen() {
  const { idToken, isAdmin, logout, user } = useRequiredAuth();
  const [dashboard, setDashboard] = useState<ReportsDashboard | null>(null);
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [dateFrom, setDateFrom] = useState(() => daysAgoIso(6));
  const [dateTo, setDateTo] = useState(todayIso());
  const [isLoading, setLoading] = useState(true);
  const [isPdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextHistory] = await Promise.all([
        fetchReportsDashboard({ idToken, role: user.role }),
        fetchSalesHistory({ idToken, role: user.role, dateFrom, dateTo }),
      ]);
      setDashboard(nextDashboard);
      setHistory(nextHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar reportes');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, idToken, user.role]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function handleCashClosePdf() {
    setPdfLoading(true);
    setError(null);
    try {
      await downloadCashClosePdf({ idToken, dateFrom, dateTo });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar cierre de caja');
    } finally {
      setPdfLoading(false);
    }
  }

  const totalWeek = useMemo(
    () => dashboard?.ingresosSemanales.reduce((total, point) => total + point.totalCentavos, 0) ?? 0,
    [dashboard],
  );
  const stockAlerts = dashboard?.stockBajo.length ?? 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(228,0,43,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7f8fa_46%,#eef0f4_100%)] text-gray-950">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-0 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="z-20 border-b border-white/60 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="rounded-panel border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-xl">
            <strong className="block text-base font-semibold text-gray-950">Audi Disc</strong>
            <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Reportes / {user.role}
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
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/clientes">
              <UsersRound className="h-4 w-4" />
              Clientes
            </a>
            <a className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-sm" href="/reportes">
              <span className="h-2 w-2 rounded-full bg-audi-red" />
              <BarChart3 className="h-4 w-4 text-gray-500" />
              Reportes
            </a>
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/historial">
              <ReceiptText className="h-4 w-4" />
              Ventas Pasadas
            </a>
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/bi">
              <TrendingUp className="h-4 w-4" />
              Graficos Avanzados
            </a>
            <a className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70" href="/auditoria">
              <ShieldCheck className="h-4 w-4" />
              Auditoria
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
              <a href="/inventario" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Inteligencia</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Dashboard de Reportes
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500">
                Ventas de hoy, semana comercial e historial por rangos de fecha.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <AppButton
                variant="neutral"
                icon={<FileText className="h-4 w-4" />}
                isLoading={isPdfLoading}
                onClick={() => void handleCashClosePdf()}
              >
                PDF cierre de caja
              </AppButton>
              <AppButton variant="primary" isLoading={isLoading} onClick={() => void loadReports()}>
                Actualizar reportes
              </AppButton>
            </div>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Ventas hoy</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950">
                {formatBsFromCentavos(dashboard?.ventasHoy.totalCentavos ?? 0)}
              </strong>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Cantidad</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950">
                {dashboard?.ventasHoy.cantidadVentas ?? 0}
              </strong>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Semana</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950">
                {formatBsFromCentavos(totalWeek)}
              </strong>
            </article>
            {isAdmin && (
              <article className="rounded-panel bg-audi-red p-5 text-white shadow-button">
                <span className="text-sm font-semibold text-white/80">Utilidad hoy</span>
                <strong className="mt-2 block text-3xl font-semibold">
                  {formatBsFromCentavos(dashboard?.ventasHoy.utilidadCentavos ?? 0)}
                </strong>
                <span className="mt-1 block text-sm font-semibold text-white/80">
                  Margen {dashboard?.ventasHoy.margenPorcentaje ?? 0}%
                </span>
              </article>
            )}
          </section>

          <section className="grid max-w-6xl gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] xl:items-stretch">
            <WeeklyRevenueChart data={dashboard?.ingresosSemanales ?? []} showProfit={isAdmin} />

            <aside className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-xl">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
                    Quick Stats
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950">Caja activa</h2>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-audi-red text-white shadow-button">
                  <TrendingUp className="h-5 w-5" />
                </span>
              </div>

              <div className="grid gap-4">
                <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-600">
                      <ReceiptText className="h-5 w-5" />
                    </span>
                    <div>
                      <span className="block text-sm font-semibold text-gray-500">Ventas hoy</span>
                      <strong className="mt-1 block text-xl font-semibold text-gray-950">
                        {formatBsFromCentavos(dashboard?.ventasHoy.totalCentavos ?? 0)}
                      </strong>
                    </div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                    {dashboard?.ventasHoy.cantidadVentas ?? 0}
                  </span>
                </div>

                {isAdmin ? (
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-audi-red text-white">
                        <Activity className="h-5 w-5" />
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-gray-500">Utilidad hoy</span>
                        <strong className="mt-1 block text-xl font-semibold text-gray-950">
                          {formatBsFromCentavos(dashboard?.ventasHoy.utilidadCentavos ?? 0)}
                        </strong>
                      </div>
                    </div>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-audi-red">
                      {dashboard?.ventasHoy.margenPorcentaje ?? 0}%
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-600">
                        <Activity className="h-5 w-5" />
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-gray-500">Ticket promedio</span>
                        <strong className="mt-1 block text-xl font-semibold text-gray-950">
                          {formatBsFromCentavos(dashboard?.ventasHoy.ticketPromedioCentavos ?? 0)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-600">
                      <BarChart3 className="h-5 w-5" />
                    </span>
                    <div>
                      <span className="block text-sm font-semibold text-gray-500">Semana</span>
                      <strong className="mt-1 block text-xl font-semibold text-gray-950">
                        {formatBsFromCentavos(totalWeek)}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-10 w-10 place-items-center rounded-2xl ${stockAlerts ? 'bg-audi-red text-white' : 'bg-gray-100 text-gray-600'}`}>
                      <AlertTriangle className="h-5 w-5" />
                    </span>
                    <div>
                      <span className="block text-sm font-semibold text-gray-500">Alertas stock</span>
                      <strong className="mt-1 block text-xl font-semibold text-gray-950">
                        {stockAlerts}
                      </strong>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${stockAlerts ? 'bg-red-50 text-audi-red' : 'bg-gray-100 text-gray-600'}`}>
                    {stockAlerts ? 'Revisar' : 'OK'}
                  </span>
                </div>
              </div>
            </aside>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <YearComparisonChart data={dashboard?.comparativaInteranual ?? []} />
            <div className="grid gap-5">
              <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-audi-red text-white">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Top 5</p>
                    <h2 className="text-xl font-semibold text-gray-950">Productos mas vendidos</h2>
                  </div>
                </div>
                <div className="grid gap-3">
                  {(dashboard?.topProductos ?? []).map(product => (
                    <div key={product.productoId} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="line-clamp-1 text-sm font-semibold text-gray-950">{product.nombre}</strong>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                          {product.cantidadVendida} u.
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                        <span className="text-gray-500">Ventas</span>
                        <span>{formatBsFromCentavos(product.totalCentavos)}</span>
                      </div>
                      {isAdmin && (
                        <div className="mt-1 flex items-center justify-between text-xs font-bold text-audi-red">
                          <span>Utilidad</span>
                          <span>{formatBsFromCentavos(product.utilidadCentavos ?? 0)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-950 text-white">
                    <UsersRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Top 5</p>
                    <h2 className="text-xl font-semibold text-gray-950">Mejores clientes</h2>
                  </div>
                </div>
                <div className="grid gap-3">
                  {(dashboard?.topClientes ?? []).map((customer, index) => (
                    <div key={`${customer.clienteId ?? customer.nombre}-${index}`} className="rounded-2xl border border-gray-100 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="line-clamp-1 text-sm font-semibold text-gray-950">{customer.nombre}</strong>
                        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-audi-red">
                          {customer.cantidadCompras}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                        <span className="text-gray-500">{customer.telefono ?? 'Sin telefono'}</span>
                        <span>{formatBsFromCentavos(customer.totalCentavos)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="mt-5 rounded-panel border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur-xl">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">RegistroDias</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">Historial por rango</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="grid gap-1 text-sm font-semibold text-gray-600">
                  Desde
                  <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-11 rounded-2xl border border-gray-200 px-3" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-gray-600">
                  Hasta
                  <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-11 rounded-2xl border border-gray-200 px-3" />
                </label>
                <AppButton variant="neutral" icon={<CalendarRange className="h-4 w-4" />} onClick={() => void loadReports()}>
                  Consultar
                </AppButton>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-4">
                <span className="text-sm font-semibold text-gray-500">Total rango</span>
                <strong className="mt-1 block text-xl font-semibold">{formatBsFromCentavos(history?.totalCentavos ?? 0)}</strong>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4">
                <span className="text-sm font-semibold text-gray-500">Ventas</span>
                <strong className="mt-1 block text-xl font-semibold">{history?.cantidadVentas ?? 0}</strong>
              </div>
              {isAdmin && (
                <div className="rounded-2xl bg-audi-red p-4 text-white">
                  <span className="text-sm font-semibold text-white/80">Utilidad rango</span>
                  <strong className="mt-1 block text-xl font-semibold">{formatBsFromCentavos(history?.utilidadCentavos ?? 0)}</strong>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-panel border border-gray-100 bg-white">
              {(history?.ventas ?? []).map(sale => (
                <div key={sale.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <strong className="block text-gray-950">{sale.id}</strong>
                    <span className="text-sm font-medium text-gray-500">{sale.fechaLocal} / {sale.horaLocal} / {sale.metodo}</span>
                    <div className="mt-2 text-sm text-gray-600">
                      {sale.productos.map(item => (
                        <span key={`${sale.id}-${item.productoId}`} className="mr-3 inline-block">
                          {item.nombre} x{item.cantidad}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-left lg:text-right">
                    <strong className="block text-lg text-gray-950">{formatBsFromCentavos(sale.totalCentavos)}</strong>
                    {isAdmin && (
                      <span className="text-sm font-semibold text-audi-red">
                        Utilidad {formatBsFromCentavos(sale.productos.reduce((sum, item) => sum + (item.utilidadCentavos ?? 0), 0))}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!(history?.ventas.length) && (
                <div className="p-8 text-center text-sm font-medium text-gray-500">Sin ventas en el rango seleccionado.</div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
