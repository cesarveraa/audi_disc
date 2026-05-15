import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Boxes,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsDashboard, ParetoProductMetric } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppSidebar } from '@app/navigation/AppSidebar';
import { AppButton } from '@core/ui/AppButton';
import { fetchAnalyticsDashboard } from '@features/analytics/services/analyticsService';

type ChartTooltipPayload = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

type ChartTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: ChartTooltipPayload[];
};

const PIE_COLORS = ['#E4002B', '#111827', '#6B7280'];

function moneyTick(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return `Bs ${Math.round(numeric / 100).toLocaleString('es-BO')}`;
}

function percentTick(value: number | string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}%` : '';
}

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const paretoClass = payload[0]?.payload?.paretoClass;
  const isClassCount = String(payload[0]?.payload?.name ?? '').startsWith('Clase');
  return (
    <div className="rounded-2xl border border-white/10 bg-gray-950/95 px-4 py-3 text-sm text-white shadow-2xl">
      <strong className="block max-w-72 truncate">{label}</strong>
      <div className="mt-2 grid gap-1">
        {payload.map(item => (
          <span key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-4 text-white/75">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? '#E4002B' }} />
              {item.name}
            </span>
            <strong className="text-white">
              {String(item.name).includes('%')
                ? percentTick(item.value ?? 0)
                : isClassCount
                  ? `${Number(item.value ?? 0).toLocaleString('es-BO')} productos`
                  : moneyTick(item.value ?? 0)}
            </strong>
          </span>
        ))}
      </div>
      {typeof paretoClass === 'string' && (
        <p className="mt-2 max-w-72 text-xs leading-5 text-white/60">
          Clase {String(paretoClass)} segun Pareto: prioriza decision comercial y reposicion.
        </p>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = 'dark',
}: {
  label: string;
  value: string;
  helper: string;
  tone?: 'dark' | 'red';
}) {
  return (
    <article className={[
      'rounded-panel border p-5 shadow-card',
      tone === 'red'
        ? 'border-audi-red bg-audi-red text-white'
        : 'border-white/10 bg-white/[0.06] text-white',
    ].join(' ')}>
      <span className={tone === 'red' ? 'text-sm font-semibold text-white/75' : 'text-sm font-semibold text-white/55'}>
        {label}
      </span>
      <strong className="mt-2 block text-3xl font-semibold tracking-tight">{value}</strong>
      <p className={tone === 'red' ? 'mt-2 text-sm font-medium text-white/75' : 'mt-2 text-sm font-medium text-white/45'}>
        {helper}
      </p>
    </article>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-panel border border-white/10 bg-white/[0.04] p-8 text-center text-sm font-semibold text-white/45">
      {children}
    </div>
  );
}

export default function AdvancedAnalyticsScreen() {
  const { idToken, isAdmin, logout, user } = useRequiredAuth();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await fetchAnalyticsDashboard({ idToken }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar inteligencia de negocios');
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const paretoChart = useMemo(
    () =>
      (dashboard?.pareto.items ?? []).slice(0, 10).map(item => ({
        ...item,
        shortName: item.nombre.length > 18 ? `${item.nombre.slice(0, 18)}...` : item.nombre,
      })),
    [dashboard],
  );

  const trendChart = useMemo(
    () => dashboard?.tendencias.ventasPorMes.slice(-12) ?? [],
    [dashboard],
  );

  const paretoClassData = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0 };
    (dashboard?.pareto.items ?? []).forEach(item => {
      counts[item.paretoClass] += 1;
    });
    return [
      { name: 'Clase A', value: counts.A },
      { name: 'Clase B', value: counts.B },
      { name: 'Clase C', value: counts.C },
    ].filter(item => item.value > 0);
  }, [dashboard]);

  const topPareto: ParetoProductMetric | undefined = dashboard?.pareto.items[0];

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-0 lg:grid-cols-[292px_minmax(0,1fr)]">
        <AppSidebar active="analytics" user={user} isAdmin={isAdmin} onLogout={logout} theme="dark" />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <a href="/reportes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Volver a reportes
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Business Intelligence</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Graficos Avanzados
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/50">
                Pareto 80/20, estacionalidad, margen real y optimizacion de inventario protegidos para Administrador.
              </p>
            </div>
            <AppButton
              variant="primary"
              icon={<RefreshCw className="h-4 w-4" />}
              isLoading={isLoading}
              onClick={() => void loadDashboard()}
            >
              Actualizar BI
            </AppButton>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Ingresos analizados"
              value={formatBsFromCentavos(dashboard?.margenes.ingresosCentavos ?? 0)}
              helper={`${dashboard?.margenes.ventasAnalizadas ?? 0} ventas historicas activas`}
            />
            <MetricCard
              label="Utilidad neta real"
              value={formatBsFromCentavos(dashboard?.margenes.utilidadNetaCentavos ?? 0)}
              helper="Precio final menos costo de compra por transaccion"
              tone="red"
            />
            <MetricCard
              label="Margen promedio"
              value={`${dashboard?.margenes.margenPorcentaje ?? 0}%`}
              helper="Margen ponderado por ingresos"
            />
            <MetricCard
              label="Pareto top 20%"
              value={`${dashboard?.pareto.topTwentyRevenueSharePorcentaje ?? 0}%`}
              helper={topPareto ? `Lider: ${topPareto.nombre}` : 'Sin productos vendidos'}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
            <article className="rounded-panel border border-white/10 bg-white/[0.06] p-5 shadow-card">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Pareto 80/20</p>
                  <h2 className="mt-1 text-2xl font-semibold">Productos que mueven la caja</h2>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-white/55" title="Clase A: productos que acumulan cerca del 80% de los ingresos.">
                  Tooltip Clase A activo
                </span>
              </div>
              {paretoChart.length ? (
                <div className="overflow-x-auto pb-2">
                  <div className="h-[390px] min-w-[720px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={paretoChart} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="shortName" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tickFormatter={moneyTick} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={percentTick} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.62)', fontSize: 12 }} />
                        <Bar yAxisId="left" name="Ingresos" dataKey="totalCentavos" radius={[8, 8, 0, 0]} fill="#E4002B" />
                        <Line yAxisId="right" name="% acumulado" type="monotone" dataKey="cumulativeSharePorcentaje" stroke="#FFFFFF" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <EmptyState>Sin ventas para calcular Pareto.</EmptyState>
              )}
            </article>

            <article className="rounded-panel border border-white/10 bg-white/[0.06] p-5 shadow-card">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Clasificacion</p>
                  <h2 className="mt-1 text-2xl font-semibold">Mix Pareto</h2>
                </div>
                <TrendingUp className="h-5 w-5 text-audi-red" />
              </div>
              {paretoClassData.length ? (
                <div className="h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={paretoClassData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={5}>
                        {paretoClassData.map((entry, index) => (
                          <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>Sin clasificacion Pareto aun.</EmptyState>
              )}
              <div className="mt-4 grid gap-3">
                {(dashboard?.pareto.items ?? []).slice(0, 3).map(item => (
                  <div key={item.productoId} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <strong className="line-clamp-1 text-sm">{item.nombre}</strong>
                      <span className="rounded-full bg-audi-red px-2 py-1 text-[11px] font-bold">
                        Clase {item.paretoClass}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white/55">
                      {formatBsFromCentavos(item.totalCentavos)} / {item.revenueSharePorcentaje}%
                    </p>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            <article className="rounded-panel border border-white/10 bg-white/[0.06] p-5 shadow-card">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Tendencias</p>
                <h2 className="mt-1 text-2xl font-semibold">Ventas mensuales y margen</h2>
              </div>
              {trendChart.length ? (
                <div className="overflow-x-auto pb-2">
                  <div className="h-[340px] min-w-[680px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trendChart} margin={{ top: 12, right: 8, bottom: 8, left: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="mes" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={moneyTick} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.62)', fontSize: 12 }} />
                        <Bar name="Ingresos" dataKey="totalCentavos" radius={[8, 8, 0, 0]} fill="#E4002B" />
                        <Line name="Utilidad" type="monotone" dataKey="utilidadCentavos" stroke="#FFFFFF" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <EmptyState>Sin ventas por mes para graficar.</EmptyState>
              )}
            </article>

            <article className="rounded-panel border border-white/10 bg-white/[0.06] p-5 shadow-card">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Estacionalidad</p>
                  <h2 className="mt-1 text-2xl font-semibold">Audifonos</h2>
                </div>
                <Boxes className="h-5 w-5 text-audi-red" />
              </div>
              <div className="grid gap-3">
                {(dashboard?.tendencias.mesesFuertesAudifonos ?? []).map(month => (
                  <div key={month.mes} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <strong>{month.mes}</strong>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-950">
                        {month.cantidad} u.
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-white/55">{formatBsFromCentavos(month.totalCentavos)}</p>
                  </div>
                ))}
                {!(dashboard?.tendencias.mesesFuertesAudifonos.length) && (
                  <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-semibold text-white/45">
                    Aun no hay ventas etiquetadas como audifonos.
                  </p>
                )}
              </div>
            </article>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <article className="rounded-panel border border-white/10 bg-white/[0.06] p-5 shadow-card">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Investigacion de operaciones</p>
                <h2 className="mt-1 text-2xl font-semibold">Punto de pedido</h2>
                <p className="mt-2 text-sm font-semibold text-white/45">
                  ROP = demanda media diaria x {dashboard?.inventario.leadTimeDias ?? 7} dias + stock de seguridad.
                </p>
              </div>
              <div className="overflow-hidden rounded-panel border border-white/10">
                {(dashboard?.inventario.reorderAlerts ?? []).slice(0, 8).map(item => (
                  <div key={item.productoId} className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <strong className="block">{item.nombre}</strong>
                      <span className="mt-1 block text-sm font-semibold text-white/45">
                        Stock {item.stockActual} / ROP {item.reorderPoint} / demanda diaria {item.demandaMediaDiaria}
                      </span>
                    </div>
                    <span className="rounded-full bg-audi-red px-3 py-1 text-xs font-bold">
                      Comprar {item.sugerenciaCompra}
                    </span>
                  </div>
                ))}
                {!(dashboard?.inventario.reorderAlerts.length) && (
                  <div className="p-8 text-center text-sm font-semibold text-white/45">Sin alertas de reposicion.</div>
                )}
              </div>
            </article>

            <article className="rounded-panel border border-white/10 bg-white/[0.06] p-5 shadow-card">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">Liquidaciones</p>
                <h2 className="mt-1 text-2xl font-semibold">Stock muerto</h2>
                <p className="mt-2 text-sm font-semibold text-white/45">
                  Productos sin ventas en los ultimos 4 meses o sin venta registrada.
                </p>
              </div>
              <div className="overflow-hidden rounded-panel border border-white/10">
                {(dashboard?.inventario.deadStock ?? []).slice(0, 8).map(item => (
                  <div key={item.productoId} className="grid gap-3 border-b border-white/10 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <strong className="block">{item.nombre}</strong>
                      <span className="mt-1 block text-sm font-semibold text-white/45">
                        {item.diasSinVenta === null ? 'Sin venta historica' : `${item.diasSinVenta} dias sin venta`} / stock {item.stockActual}
                      </span>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-950">
                      {formatBsFromCentavos(item.valorInventarioCentavos)}
                    </span>
                  </div>
                ))}
                {!(dashboard?.inventario.deadStock.length) && (
                  <div className="p-8 text-center text-sm font-semibold text-white/45">Sin stock muerto detectado.</div>
                )}
              </div>
            </article>
          </section>
        </section>
      </div>
    </main>
  );
}
