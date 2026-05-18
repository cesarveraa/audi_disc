import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarRange,
  Download,
  FileText,
  FileSpreadsheet,
  ReceiptText,
  TrendingUp,
  Trophy,
  UsersRound,
} from 'lucide-react';
import type { ReportsDashboard, SalesHistory } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppSidebar } from '@app/navigation/AppSidebar';
import { AppButton } from '@core/ui/AppButton';
import { WeeklyRevenueChart } from '@features/reports/components/WeeklyRevenueChart';
import { YearComparisonChart } from '@features/reports/components/YearComparisonChart';
import {
  downloadCashClosePdf,
  downloadProductsExcel,
  downloadProductsPdf,
  downloadSalesExcel,
  downloadSalesPdf,
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
  const { canViewFinancials, idToken, logout, user } = useRequiredAuth();
  const [dashboard, setDashboard] = useState<ReportsDashboard | null>(null);
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [dateFrom, setDateFrom] = useState(() => daysAgoIso(6));
  const [dateTo, setDateTo] = useState(todayIso());
  const [isLoading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResult, historyResult] = await Promise.allSettled([
        fetchReportsDashboard({ idToken, role: user.role }),
        fetchSalesHistory({ idToken, role: user.role, dateFrom, dateTo }),
      ]);
      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value);
      }
      if (historyResult.status === 'fulfilled') {
        setHistory(historyResult.value);
      }
      const firstError = [dashboardResult, historyResult].find(result => result.status === 'rejected');
      if (firstError?.status === 'rejected') {
        setError(firstError.reason instanceof Error ? firstError.reason.message : 'No se pudieron cargar todos los reportes');
      }
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
    setExporting('cash-pdf');
    setError(null);
    try {
      await downloadCashClosePdf({ idToken, dateFrom, dateTo });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar cierre de caja');
    } finally {
      setExporting(null);
    }
  }

  async function handleExport(kind: 'products-xlsx' | 'products-pdf' | 'sales-xlsx' | 'sales-pdf') {
    setExporting(kind);
    setError(null);
    try {
      if (kind === 'products-xlsx') {
        await downloadProductsExcel({ idToken });
      }
      if (kind === 'products-pdf') {
        await downloadProductsPdf({ idToken });
      }
      if (kind === 'sales-xlsx') {
        await downloadSalesExcel({ idToken, dateFrom, dateTo });
      }
      if (kind === 'sales-pdf') {
        await downloadSalesPdf({ idToken, dateFrom, dateTo });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar la informacion');
    } finally {
      setExporting(null);
    }
  }

  const totalWeek = useMemo(
    () => dashboard?.ingresosSemanales.reduce((total, point) => total + point.totalCentavos, 0) ?? 0,
    [dashboard],
  );
  const stockAlerts = dashboard?.stockBajo.length ?? 0;

  return (
    <main className="ad-page">
      <div className="ad-shell">
        <AppSidebar active="reports" user={user} onLogout={logout} />

        <section className="ad-content min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
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
              <AppButton variant="primary" isLoading={isLoading} onClick={() => void loadReports()}>
                Actualizar reportes
              </AppButton>
            </div>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Ventas hoy</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950 dark:text-white">
                {formatBsFromCentavos(dashboard?.ventasHoy.totalCentavos ?? 0)}
              </strong>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Cantidad</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950 dark:text-white">
                {dashboard?.ventasHoy.cantidadVentas ?? 0}
              </strong>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Semana</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950 dark:text-white">
                {formatBsFromCentavos(totalWeek)}
              </strong>
            </article>
            {canViewFinancials && (
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

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] xl:items-stretch">
            <WeeklyRevenueChart data={dashboard?.ingresosSemanales ?? []} showProfit={canViewFinancials} />
            <YearComparisonChart data={dashboard?.comparativaInteranual ?? []} />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
                    Centro de exportacion
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Excel, PDF y cierre de caja</h2>
                  <p className="mt-2 max-w-2xl text-sm font-medium text-gray-500 dark:text-white/55">
                    Genera documentos operativos sin mezclar acciones con la lectura de graficas.
                  </p>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-audi-red text-white shadow-button">
                  <Download className="h-5 w-5" />
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-3 flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-audi-red" />
                    <strong className="text-gray-950 dark:text-white">Productos</strong>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AppButton variant="neutral" icon={<FileSpreadsheet className="h-4 w-4" />} isLoading={exporting === 'products-xlsx'} onClick={() => void handleExport('products-xlsx')}>
                      Excel
                    </AppButton>
                    <AppButton variant="neutral" icon={<FileText className="h-4 w-4" />} isLoading={exporting === 'products-pdf'} onClick={() => void handleExport('products-pdf')}>
                      PDF
                    </AppButton>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="mb-3 flex items-center gap-3">
                    <ReceiptText className="h-5 w-5 text-audi-red" />
                    <strong className="text-gray-950 dark:text-white">Ventas y caja</strong>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AppButton variant="neutral" icon={<FileSpreadsheet className="h-4 w-4" />} isLoading={exporting === 'sales-xlsx'} onClick={() => void handleExport('sales-xlsx')}>
                      Excel ventas
                    </AppButton>
                    <AppButton variant="neutral" icon={<FileText className="h-4 w-4" />} isLoading={exporting === 'sales-pdf'} onClick={() => void handleExport('sales-pdf')}>
                      PDF ventas
                    </AppButton>
                    <AppButton variant="neutral" icon={<FileText className="h-4 w-4" />} isLoading={exporting === 'cash-pdf'} onClick={() => void handleCashClosePdf()}>
                      Cierre PDF
                    </AppButton>
                  </div>
                </div>
              </div>
            </article>

            <aside className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Quick stats</p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Caja activa</h2>
                </div>
                <TrendingUp className="h-5 w-5 text-audi-red" />
              </div>
              <div className="grid gap-3">
                {[
                  ['Ventas hoy', formatBsFromCentavos(dashboard?.ventasHoy.totalCentavos ?? 0), `${dashboard?.ventasHoy.cantidadVentas ?? 0} ventas`],
                  [canViewFinancials ? 'Utilidad hoy' : 'Ticket promedio', formatBsFromCentavos(canViewFinancials ? dashboard?.ventasHoy.utilidadCentavos ?? 0 : dashboard?.ventasHoy.ticketPromedioCentavos ?? 0), canViewFinancials ? `Margen ${dashboard?.ventasHoy.margenPorcentaje ?? 0}%` : 'Promedio por venta'],
                  ['Semana', formatBsFromCentavos(totalWeek), 'Acumulado semanal'],
                ].map(([label, value, helper]) => (
                  <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="text-sm font-semibold text-gray-500 dark:text-white/55">{label}</span>
                    <strong className="mt-1 block text-xl font-semibold text-gray-950 dark:text-white">{value}</strong>
                    <span className="mt-1 block text-xs font-bold text-audi-red">{helper}</span>
                  </div>
                ))}
                <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Alertas stock</span>
                  <strong className="mt-1 block text-xl font-semibold text-gray-950 dark:text-white">{stockAlerts}</strong>
                  <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-bold ${stockAlerts ? 'bg-red-50 text-audi-red dark:bg-audi-red/15' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-white/60'}`}>
                    {stockAlerts ? 'Revisar inventario' : 'OK'}
                  </span>
                </div>
              </div>
            </aside>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
              <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-audi-red text-white">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Top 5</p>
                    <h2 className="text-xl font-semibold text-gray-950 dark:text-white">Productos mas vendidos</h2>
                  </div>
                </div>
                <div className="grid gap-3">
                  {(dashboard?.topProductos ?? []).map(product => (
                    <div key={product.productoId} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="line-clamp-1 text-sm font-semibold text-gray-950 dark:text-white">{product.nombre}</strong>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-white/10 dark:text-white/60">
                          {product.cantidadVendida} u.
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                        <span className="text-gray-500">Ventas</span>
                        <span>{formatBsFromCentavos(product.totalCentavos)}</span>
                      </div>
                      {canViewFinancials && (
                        <div className="mt-1 flex items-center justify-between text-xs font-bold text-audi-red">
                          <span>Utilidad</span>
                          <span>{formatBsFromCentavos(product.utilidadCentavos ?? 0)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-950 text-white">
                    <UsersRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Top 5</p>
                    <h2 className="text-xl font-semibold text-gray-950 dark:text-white">Mejores clientes</h2>
                  </div>
                </div>
                <div className="grid gap-3">
                  {(dashboard?.topClientes ?? []).map((customer, index) => (
                    <div key={`${customer.clienteId ?? customer.nombre}-${index}`} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="line-clamp-1 text-sm font-semibold text-gray-950 dark:text-white">{customer.nombre}</strong>
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
          </section>

          <section className="mt-5 rounded-panel border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">RegistroDias</p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Historial por rango</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="grid gap-1 text-sm font-semibold text-gray-600 dark:text-white/60">
                  Desde
                  <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className="h-11 rounded-2xl border border-gray-200 px-3 dark:border-white/10 dark:bg-black/20" />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-gray-600 dark:text-white/60">
                  Hasta
                  <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className="h-11 rounded-2xl border border-gray-200 px-3 dark:border-white/10 dark:bg-black/20" />
                </label>
                <AppButton variant="neutral" icon={<CalendarRange className="h-4 w-4" />} onClick={() => void loadReports()}>
                  Consultar
                </AppButton>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Total rango</span>
                <strong className="mt-1 block text-xl font-semibold text-gray-950 dark:text-white">{formatBsFromCentavos(history?.totalCentavos ?? 0)}</strong>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.04]">
                <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Ventas</span>
                <strong className="mt-1 block text-xl font-semibold text-gray-950 dark:text-white">{history?.cantidadVentas ?? 0}</strong>
              </div>
              {canViewFinancials && (
                <div className="rounded-2xl bg-audi-red p-4 text-white">
                  <span className="text-sm font-semibold text-white/80">Utilidad rango</span>
                  <strong className="mt-1 block text-xl font-semibold">{formatBsFromCentavos(history?.utilidadCentavos ?? 0)}</strong>
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-panel border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.04]">
              {(history?.ventas ?? []).map(sale => (
                <div key={sale.id} className="grid gap-3 border-b border-gray-100 p-4 last:border-b-0 dark:border-white/10 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <strong className="block text-gray-950 dark:text-white">{sale.id}</strong>
                    <span className="text-sm font-medium text-gray-500 dark:text-white/55">{sale.fechaLocal} / {sale.horaLocal} / {sale.metodo}</span>
                    <div className="mt-2 text-sm text-gray-600 dark:text-white/60">
                      {sale.productos.map(item => (
                        <span key={`${sale.id}-${item.productoId}`} className="mr-3 inline-block">
                          {item.nombre} x{item.cantidad}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-left lg:text-right">
                    <strong className="block text-lg text-gray-950 dark:text-white">{formatBsFromCentavos(sale.totalCentavos)}</strong>
                    {canViewFinancials && (
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
