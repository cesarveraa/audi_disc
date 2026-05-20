import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  CalendarRange,
  FileSpreadsheet,
  FileText,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  Search,
  SlidersHorizontal,
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
  type ProductReportFilters,
  type SalesReportFilters,
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

const inputClass =
  'h-11 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition focus:border-audi-red focus:ring-2 focus:ring-audi-red/15 dark:border-white/10 dark:bg-black/20 dark:text-white';

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-600 dark:text-white/60">
      {label}
      {children}
    </label>
  );
}

function MetricTile({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: 'neutral' | 'red';
}) {
  return (
    <article
      className={[
        'rounded-panel p-5 shadow-card',
        tone === 'red'
          ? 'bg-audi-red text-white'
          : 'border border-white/70 bg-white/85 text-gray-950 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:text-white',
      ].join(' ')}
    >
      <span className={tone === 'red' ? 'text-sm font-semibold text-white/80' : 'text-sm font-semibold text-gray-500 dark:text-white/55'}>
        {label}
      </span>
      <strong className="mt-2 block text-3xl font-semibold">{value}</strong>
      {helper && <span className={tone === 'red' ? 'mt-1 block text-sm font-semibold text-white/80' : 'mt-1 block text-sm font-semibold text-audi-red'}>{helper}</span>}
    </article>
  );
}

function ExportButton({
  label,
  icon,
  loading,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <AppButton variant="neutral" icon={icon} isLoading={loading} onClick={onClick} className="justify-center">
      {label}
    </AppButton>
  );
}

export default function ReportsDashboardScreen() {
  const { canViewFinancials, idToken, logout, user } = useRequiredAuth();
  const [dashboard, setDashboard] = useState<ReportsDashboard | null>(null);
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [salesFilters, setSalesFilters] = useState<SalesReportFilters>(() => ({
    dateFrom: daysAgoIso(6),
    dateTo: todayIso(),
    producto: '',
    metodo: '',
  }));
  const [productFilters, setProductFilters] = useState<ProductReportFilters>({
    q: '',
    marca: '',
    categoria: '',
    estado: 'active',
    stock: 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [isLoading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(
    async (filters: SalesReportFilters) => {
      setLoading(true);
      setError(null);
      try {
        const [dashboardResult, historyResult] = await Promise.allSettled([
          fetchReportsDashboard({ idToken, role: user.role }),
          fetchSalesHistory({ idToken, role: user.role, filters }),
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
    },
    [idToken, user.role],
  );

  useEffect(() => {
    void loadReports(salesFilters);
    // Solo se dispara al entrar o al cambiar la sesion; los filtros se aplican con el boton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadReports]);

  function updateSalesFilter<K extends keyof SalesReportFilters>(key: K, value: SalesReportFilters[K]) {
    setSalesFilters(current => ({ ...current, [key]: value }));
  }

  function updateProductFilter<K extends keyof ProductReportFilters>(key: K, value: ProductReportFilters[K]) {
    setProductFilters(current => ({ ...current, [key]: value }));
  }

  async function handleExport(kind: 'products-xlsx' | 'products-pdf' | 'sales-xlsx' | 'sales-pdf' | 'cash-pdf') {
    setExporting(kind);
    setError(null);
    try {
      if (kind === 'products-xlsx') {
        await downloadProductsExcel({ idToken, filters: productFilters });
      }
      if (kind === 'products-pdf') {
        await downloadProductsPdf({ idToken, filters: productFilters });
      }
      if (kind === 'sales-xlsx') {
        await downloadSalesExcel({ idToken, filters: salesFilters });
      }
      if (kind === 'sales-pdf') {
        await downloadSalesPdf({ idToken, filters: salesFilters });
      }
      if (kind === 'cash-pdf') {
        await downloadCashClosePdf({ idToken, filters: salesFilters });
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
  const salesUtility = history?.utilidadCentavos ?? 0;
  const salesMargin = history?.margenPorcentaje ?? 0;

  return (
    <main className="ad-page">
      <div className="ad-shell">
        <AppSidebar active="reports" user={user} onLogout={logout} />

        <section className="ad-content min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <a href="/inventario" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950 dark:text-white/55 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Reportes</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl dark:text-white">
                Panel de control
              </h1>
            </div>
            <AppButton variant="primary" icon={<RefreshCw className="h-4 w-4" />} isLoading={isLoading} onClick={() => void loadReports(salesFilters)}>
              Actualizar
            </AppButton>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Ventas hoy" value={formatBsFromCentavos(dashboard?.ventasHoy.totalCentavos ?? 0)} />
            <MetricTile label="Operaciones" value={dashboard?.ventasHoy.cantidadVentas ?? 0} helper={`Ticket ${formatBsFromCentavos(dashboard?.ventasHoy.ticketPromedioCentavos ?? 0)}`} />
            <MetricTile label="Semana" value={formatBsFromCentavos(totalWeek)} />
            <MetricTile
              label={canViewFinancials ? 'Utilidad hoy' : 'Stock bajo'}
              value={canViewFinancials ? formatBsFromCentavos(dashboard?.ventasHoy.utilidadCentavos ?? 0) : stockAlerts}
              helper={canViewFinancials ? `Margen ${dashboard?.ventasHoy.margenPorcentaje ?? 0}%` : stockAlerts ? 'Revisar' : 'OK'}
              tone={canViewFinancials ? 'red' : 'neutral'}
            />
          </section>

          <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Ventas</p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Filtros y exportacion</h2>
                </div>
                <ReceiptText className="h-6 w-6 text-audi-red" />
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FieldLabel label="Desde">
                  <input type="date" value={salesFilters.dateFrom} onChange={event => updateSalesFilter('dateFrom', event.target.value)} className={inputClass} />
                </FieldLabel>
                <FieldLabel label="Hasta">
                  <input type="date" value={salesFilters.dateTo} onChange={event => updateSalesFilter('dateTo', event.target.value)} className={inputClass} />
                </FieldLabel>
                <FieldLabel label="Producto">
                  <span className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input value={salesFilters.producto ?? ''} onChange={event => updateSalesFilter('producto', event.target.value)} className={`${inputClass} pl-9`} placeholder="Nombre, SKU o marca" />
                  </span>
                </FieldLabel>
                <FieldLabel label="Metodo">
                  <select value={salesFilters.metodo ?? ''} onChange={event => updateSalesFilter('metodo', event.target.value as SalesReportFilters['metodo'])} className={inputClass}>
                    <option value="">Todos</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="QR">QR</option>
                    <option value="Transferencia">Transferencia</option>
                  </select>
                </FieldLabel>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <AppButton variant="primary" icon={<CalendarRange className="h-4 w-4" />} isLoading={isLoading} onClick={() => void loadReports(salesFilters)}>
                  Aplicar filtros
                </AppButton>
                <ExportButton label="Excel ventas" icon={<FileSpreadsheet className="h-4 w-4" />} loading={exporting === 'sales-xlsx'} onClick={() => void handleExport('sales-xlsx')} />
                <ExportButton label="PDF ventas" icon={<FileText className="h-4 w-4" />} loading={exporting === 'sales-pdf'} onClick={() => void handleExport('sales-pdf')} />
                <ExportButton label="Cierre PDF" icon={<FileText className="h-4 w-4" />} loading={exporting === 'cash-pdf'} onClick={() => void handleExport('cash-pdf')} />
              </div>
            </article>

            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Productos</p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Filtros de inventario</h2>
                </div>
                <PackageSearch className="h-6 w-6 text-audi-red" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label="Busqueda">
                  <input value={productFilters.q ?? ''} onChange={event => updateProductFilter('q', event.target.value)} className={inputClass} placeholder="Producto o SKU" />
                </FieldLabel>
                <FieldLabel label="Marca">
                  <input value={productFilters.marca ?? ''} onChange={event => updateProductFilter('marca', event.target.value)} className={inputClass} placeholder="Marca" />
                </FieldLabel>
                <FieldLabel label="Categoria">
                  <input value={productFilters.categoria ?? ''} onChange={event => updateProductFilter('categoria', event.target.value)} className={inputClass} placeholder="Categoria" />
                </FieldLabel>
                <FieldLabel label="Estado">
                  <select value={productFilters.estado ?? 'active'} onChange={event => updateProductFilter('estado', event.target.value as ProductReportFilters['estado'])} className={inputClass}>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                    <option value="all">Todos</option>
                  </select>
                </FieldLabel>
                <FieldLabel label="Stock">
                  <select value={productFilters.stock ?? 'all'} onChange={event => updateProductFilter('stock', event.target.value as ProductReportFilters['stock'])} className={inputClass}>
                    <option value="all">Todos</option>
                    <option value="healthy">Saludable</option>
                    <option value="low">Bajo</option>
                    <option value="critical">Critico</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </FieldLabel>
                <FieldLabel label="Actualizado desde">
                  <input type="date" value={productFilters.dateFrom ?? ''} onChange={event => updateProductFilter('dateFrom', event.target.value)} className={inputClass} />
                </FieldLabel>
                <FieldLabel label="Actualizado hasta">
                  <input type="date" value={productFilters.dateTo ?? ''} onChange={event => updateProductFilter('dateTo', event.target.value)} className={inputClass} />
                </FieldLabel>
                <div className="flex items-end gap-2">
                  <ExportButton label="Excel productos" icon={<FileSpreadsheet className="h-4 w-4" />} loading={exporting === 'products-xlsx'} onClick={() => void handleExport('products-xlsx')} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ExportButton label="PDF productos" icon={<FileText className="h-4 w-4" />} loading={exporting === 'products-pdf'} onClick={() => void handleExport('products-pdf')} />
                <AppButton
                  variant="ghost"
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  onClick={() => setProductFilters({ q: '', marca: '', categoria: '', estado: 'active', stock: 'all', dateFrom: '', dateTo: '' })}
                >
                  Limpiar productos
                </AppButton>
              </div>
            </article>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)] xl:items-stretch">
            <WeeklyRevenueChart data={dashboard?.ingresosSemanales ?? []} showProfit={canViewFinancials} />
            <YearComparisonChart data={dashboard?.comparativaInteranual ?? []} />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-audi-red text-white">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Rango</p>
                  <h2 className="text-xl font-semibold text-gray-950 dark:text-white">Resumen filtrado</h2>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <MetricTile label="Total" value={formatBsFromCentavos(history?.totalCentavos ?? 0)} />
                <MetricTile label="Ventas" value={history?.cantidadVentas ?? 0} />
                {canViewFinancials && <MetricTile label="Utilidad" value={formatBsFromCentavos(salesUtility)} helper={`Margen ${salesMargin}%`} tone="red" />}
              </div>
            </article>

            <aside className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Inventario</p>
                  <h2 className="text-xl font-semibold text-gray-950 dark:text-white">Alertas</h2>
                </div>
                <strong className="text-3xl font-semibold text-gray-950 dark:text-white">{stockAlerts}</strong>
              </div>
              <div className="grid gap-2">
                {(dashboard?.stockBajo ?? []).slice(0, 4).map(alert => (
                  <div key={alert.producto.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-white">{alert.producto.nombre}</span>
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-audi-red dark:bg-audi-red/15">{alert.producto.cantidad}</span>
                  </div>
                ))}
                {stockAlerts === 0 && <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-500 dark:bg-white/[0.04] dark:text-white/60">Sin alertas</div>}
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
                      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-audi-red">{customer.cantidadCompras}</span>
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

        </section>
      </div>
    </main>
  );
}
