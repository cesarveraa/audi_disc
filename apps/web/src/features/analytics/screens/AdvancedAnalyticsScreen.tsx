import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Flame,
  RefreshCw,
  TimerReset,
  WalletCards,
} from 'lucide-react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  InventoryHealthItem,
  InventoryHealthResponse,
  ParetoMarginItem,
  ParetoMarginResponse,
  PriceWaterfallResponse,
  PriceWaterfallStep,
  SalesHeatmapCell,
  SalesHeatmapResponse,
} from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppSidebar } from '@app/navigation/AppSidebar';
import { AppButton } from '@core/ui/AppButton';
import {
  fetchInventoryHealth,
  fetchParetoMargin,
  fetchPriceWaterfall,
  fetchSalesHeatmap,
} from '@features/analytics/services/analyticsService';

const AUDI_RED = '#E4002B';
const AUDI_YELLOW = '#FFC107';
const AUDI_GREEN = '#00E676';
const GRID = 'rgba(255,255,255,0.10)';
const AXIS = 'rgba(255,255,255,0.64)';

type HeatMetric = 'tickets' | 'utilidad';

type AdvancedBiState = {
  inventory: InventoryHealthResponse;
  pareto: ParetoMarginResponse;
  waterfall: PriceWaterfallResponse;
  heatmap: SalesHeatmapResponse;
};

type InventoryScatterDatum = {
  x: number;
  y: number;
  productoId: string;
  nombre: string;
  categoria?: string | null;
  stockActual: number;
  capitalInmovilizadoCentavos: number;
  recenciaDias: number | null;
  autonomiaDiasRaw: number | null;
  roiInventarioPorcentaje: number;
  isDeadStockRisk: boolean;
};

type HeatmapDatum = SalesHeatmapCell & {
  y: number;
};

type TooltipPayload = {
  name?: string;
  value?: number | string | [number, number];
  payload?: Record<string, unknown>;
  color?: string;
};

type RechartsTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
};

type VariableWidthBarProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ParetoMarginItem & { shortCategoria?: string };
};

function moneyTick(value: number | string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return `Bs ${Math.round(numeric / 100).toLocaleString('es-BO')}`;
}

function percentTick(value: number | string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : '';
}

function compactNumber(value: number) {
  return value.toLocaleString('es-BO', { maximumFractionDigits: 0 });
}

function paretoColor(paretoClass: 'A' | 'B' | 'C') {
  if (paretoClass === 'A') {
    return AUDI_GREEN;
  }
  if (paretoClass === 'B') {
    return AUDI_YELLOW;
  }
  return '#7B8794';
}

function truncateLabel(value: string, size = 14) {
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function bubbleSize(capitalCentavos: number) {
  if (capitalCentavos <= 0) {
    return 7;
  }
  return Math.max(8, Math.min(32, Math.sqrt(capitalCentavos / 750)));
}

function heatColor(value: number, maxValue: number) {
  if (!Number.isFinite(value) || value <= 0 || maxValue <= 0) {
    return '#151515';
  }
  const ratio = Math.min(1, value / maxValue);
  if (ratio >= 0.82) {
    return AUDI_RED;
  }
  if (ratio >= 0.58) {
    return '#B80022';
  }
  if (ratio >= 0.34) {
    return '#7A1222';
  }
  if (ratio >= 0.12) {
    return '#3A151C';
  }
  return '#202020';
}

function scatterColor({ serieId }: { serieId: string | number }) {
  const id = String(serieId);
  if (id === 'Stock muerto') {
    return AUDI_RED;
  }
  if (id === 'Vigilancia') {
    return AUDI_YELLOW;
  }
  if (id === 'Saludable') {
    return AUDI_GREEN;
  }
  return '#8B949E';
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-lg border border-white/10 bg-white/[0.035] p-8 text-center text-sm font-semibold text-white/50">
      {children}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  icon: ReactElement;
  label: string;
  value: string;
  helper: string;
  tone?: 'neutral' | 'red' | 'green' | 'yellow';
}) {
  const toneClass = {
    neutral: 'border-white/10 bg-[#181818]',
    red: 'border-audi-red/60 bg-audi-red/15',
    green: 'border-[#00E676]/50 bg-[#00E676]/10',
    yellow: 'border-[#FFC107]/45 bg-[#FFC107]/10',
  }[tone];
  const iconClass = {
    neutral: 'text-white/70',
    red: 'text-audi-red',
    green: 'text-[#00E676]',
    yellow: 'text-[#FFC107]',
  }[tone];

  return (
    <article className={`rounded-lg border p-4 shadow-card ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{label}</span>
        <span className={iconClass}>{icon}</span>
      </div>
      <strong className="mt-3 block text-2xl font-semibold text-white sm:text-3xl">{value}</strong>
      <span className="mt-2 block text-sm font-semibold text-white/50">{helper}</span>
    </article>
  );
}

function ChartPanel({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children: ReactElement;
  aside?: ReactElement;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-[#181818] p-4 shadow-card sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-audi-red">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-white sm:text-2xl">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </article>
  );
}

function VariableWidthParetoBar({ x = 0, y = 0, width = 0, height = 0, payload }: VariableWidthBarProps) {
  const ratio = Math.max(0.18, Math.min(1, payload?.volumenRelativo ?? 1));
  const nextWidth = Math.max(10, width * ratio);
  const offset = (width - nextWidth) / 2;
  const fill = paretoColor(payload?.paretoClass ?? 'C');
  return <rect x={x + offset} y={y} width={nextWidth} height={height} rx={4} fill={fill} />;
}

function ParetoTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const item = payload[0]?.payload as ParetoMarginItem | undefined;
  if (!item) {
    return null;
  }
  return (
    <div className="rounded-lg border border-white/10 bg-[#111111]/95 px-4 py-3 text-sm text-white shadow-2xl">
      <strong className="block max-w-72 truncate">{label}</strong>
      <div className="mt-2 grid gap-1 text-white/70">
        <span>Ingresos: {formatBsFromCentavos(item.ingresosCentavos)}</span>
        <span>Margen: {item.margenGananciaPorcentaje}%</span>
        <span>Volumen: {item.ingresoPorcentaje}%</span>
        <span>Clase {item.paretoClass}</span>
      </div>
    </div>
  );
}

function WaterfallTooltip({ active, payload, label }: RechartsTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }
  const step = payload[0]?.payload as PriceWaterfallStep | undefined;
  if (!step) {
    return null;
  }
  return (
    <div className="rounded-lg border border-white/10 bg-[#111111]/95 px-4 py-3 text-sm text-white shadow-2xl">
      <strong className="block">{label}</strong>
      <span className={step.deltaCentavos < 0 ? 'mt-2 block font-semibold text-audi-red' : 'mt-2 block font-semibold text-[#00E676]'}>
        {formatBsFromCentavos(step.deltaCentavos)}
      </span>
      <span className="mt-1 block text-white/55">Acumulado: {formatBsFromCentavos(step.runningTotalCentavos)}</span>
    </div>
  );
}

function buildScatterSeries(items: InventoryHealthItem[]): { id: string; data: InventoryScatterDatum[] }[] {
  const buckets: Record<string, InventoryScatterDatum[]> = {
    'Stock muerto': [],
    Vigilancia: [],
    Saludable: [],
    'Sin rotacion': [],
  };

  items
    .filter(item => item.stockActual > 0)
    .slice(0, 500)
    .forEach(item => {
      const serie = item.isDeadStockRisk
        ? 'Stock muerto'
        : item.colorStatus === 'healthy'
          ? 'Saludable'
          : item.colorStatus === 'watch'
            ? 'Vigilancia'
            : 'Sin rotacion';
      buckets[serie].push({
        x: item.autonomiaDias,
        y: item.roiInventarioPorcentaje,
        productoId: item.productoId,
        nombre: item.nombre,
        categoria: item.categoria,
        stockActual: item.stockActual,
        capitalInmovilizadoCentavos: item.capitalInmovilizadoCentavos,
        recenciaDias: item.recenciaDias,
        autonomiaDiasRaw: item.autonomiaDiasRaw,
        roiInventarioPorcentaje: item.roiInventarioPorcentaje,
        isDeadStockRisk: item.isDeadStockRisk,
      });
    });

  return Object.entries(buckets)
    .filter(([, data]) => data.length > 0)
    .map(([id, data]) => ({ id, data }));
}

function buildWaterfallData(waterfall: PriceWaterfallResponse | null) {
  return (waterfall?.steps ?? []).map(step => ({
    ...step,
    range: [step.startCentavos, step.endCentavos],
  }));
}

function buildHeatmapData(heatmap: SalesHeatmapResponse | null, metric: HeatMetric) {
  return (heatmap?.data ?? []).map(row => ({
    id: row.id,
    data: row.data.map(cell => ({
      ...cell,
      y: metric === 'tickets' ? cell.tickets : cell.utilidadCentavos,
    })),
  }));
}

const nivoTheme = {
  background: 'transparent',
  text: {
    fill: 'rgba(255,255,255,0.72)',
    fontSize: 12,
  },
  axis: {
    domain: { line: { stroke: GRID } },
    ticks: {
      line: { stroke: GRID },
      text: { fill: AXIS, fontSize: 11 },
    },
    legend: {
      text: { fill: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: 700 },
    },
  },
  grid: {
    line: { stroke: GRID, strokeWidth: 1 },
  },
  tooltip: {
    container: {
      background: '#111111',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      boxShadow: '0 20px 45px rgba(0,0,0,0.36)',
    },
  },
};

export default function AdvancedAnalyticsScreen() {
  const { idToken, logout, user } = useRequiredAuth();
  const [bi, setBi] = useState<AdvancedBiState | null>(null);
  const [heatMetric, setHeatMetric] = useState<HeatMetric>('tickets');
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBi = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inventory, pareto, waterfall, heatmap] = await Promise.all([
        fetchInventoryHealth({ idToken }),
        fetchParetoMargin({ idToken }),
        fetchPriceWaterfall({ idToken }),
        fetchSalesHeatmap({ idToken }),
      ]);
      setBi({ inventory, pareto, waterfall, heatmap });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar BI avanzado');
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    void loadBi();
  }, [loadBi]);

  const deadStockItems = useMemo(
    () => bi?.inventory.items.filter(item => item.isDeadStockRisk) ?? [],
    [bi],
  );

  const capitalAtRisk = useMemo(
    () => deadStockItems.reduce((total, item) => total + item.capitalInmovilizadoCentavos, 0),
    [deadStockItems],
  );

  const scatterSeries = useMemo(
    () => buildScatterSeries(bi?.inventory.items ?? []),
    [bi],
  );

  const paretoData = useMemo(
    () =>
      (bi?.pareto.items ?? []).slice(0, 12).map(item => ({
        ...item,
        shortCategoria: truncateLabel(item.categoria),
      })),
    [bi],
  );

  const classACount = useMemo(
    () => (bi?.pareto.items ?? []).filter(item => item.paretoClass === 'A').length,
    [bi],
  );

  const waterfallData = useMemo(() => buildWaterfallData(bi?.waterfall ?? null), [bi]);

  const heatmapData = useMemo(
    () => buildHeatmapData(bi?.heatmap ?? null, heatMetric),
    [bi, heatMetric],
  );

  const heatMax = heatMetric === 'tickets'
    ? bi?.heatmap.maxTickets ?? 0
    : bi?.heatmap.maxUtilidadCentavos ?? 0;

  const peakHeatCell = useMemo<{ day: string; cell: SalesHeatmapCell } | null>(() => {
    const rows = bi?.heatmap.data ?? [];
    let peak: { day: string; cell: SalesHeatmapCell } | null = null;
    for (const row of rows) {
      for (const cell of row.data) {
        const current = heatMetric === 'tickets' ? cell.tickets : cell.utilidadCentavos;
        const previous = peak ? (heatMetric === 'tickets' ? peak.cell.tickets : peak.cell.utilidadCentavos) : -1;
        if (current > previous) {
          peak = { day: row.id, cell };
        }
      }
    }
    return peak;
  }, [bi, heatMetric]);

  const marginPocket = useMemo(() => {
    const summary = bi?.waterfall.summary;
    if (!summary || summary.ingresoPotencialCentavos <= 0) {
      return 0;
    }
    return Math.round((summary.utilidadNetaCentavos / summary.ingresoPotencialCentavos) * 1000) / 10;
  }, [bi]);

  return (
    <main className="min-h-screen bg-[#111111] text-white">
      <div className="ad-shell">
        <AppSidebar active="analytics" user={user} onLogout={logout} />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <a href="/reportes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-white/50 transition hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Volver a reportes
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Audi Red Edition</p>
              <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
                Inteligencia Artificial y BI Avanzado
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/55">
                Inventario, margen, fuga de precio y comportamiento horario con datos transaccionales del ERP.
              </p>
            </div>
            <AppButton
              variant="primary"
              icon={<RefreshCw className="h-4 w-4" />}
              isLoading={isLoading}
              onClick={() => void loadBi()}
            >
              Actualizar BI
            </AppButton>
          </header>

          {error && <div className="mb-5 rounded-lg bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Capital en riesgo"
              value={formatBsFromCentavos(capitalAtRisk)}
              helper={`${deadStockItems.length} SKUs en cuadrante rojo`}
              icon={<Flame className="h-5 w-5" />}
              tone="red"
            />
            <MetricCard
              label="Margen de bolsillo"
              value={`${marginPocket}%`}
              helper={formatBsFromCentavos(bi?.waterfall.summary.utilidadNetaCentavos ?? 0)}
              icon={<WalletCards className="h-5 w-5" />}
              tone={marginPocket >= 20 ? 'green' : 'yellow'}
            />
            <MetricCard
              label="Categorias Clase A"
              value={compactNumber(classACount)}
              helper={formatBsFromCentavos(bi?.pareto.totalUtilidadCentavos ?? 0)}
              icon={<BarChart3 className="h-5 w-5" />}
              tone="green"
            />
            <MetricCard
              label="Pico temporal"
              value={peakHeatCell ? `${peakHeatCell.day} ${peakHeatCell.cell.x}` : 'Sin datos'}
              helper={heatMetric === 'tickets'
                ? `${peakHeatCell?.cell.tickets ?? 0} tickets`
                : formatBsFromCentavos(peakHeatCell?.cell.utilidadCentavos ?? 0)}
              icon={<TimerReset className="h-5 w-5" />}
              tone="neutral"
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <ChartPanel
              eyebrow="Inventario"
              title="Matriz de Stock Muerto y Riesgo"
              aside={
                <span className="rounded-full border border-audi-red/45 bg-audi-red/10 px-3 py-1 text-xs font-bold text-audi-red">
                  {bi?.inventory.totalProductos ?? 0} productos
                </span>
              }
            >
              {scatterSeries.length ? (
                <div className="h-[440px] min-w-0">
                  <ResponsiveScatterPlot<InventoryScatterDatum>
                    data={scatterSeries}
                    margin={{ top: 24, right: 34, bottom: 70, left: 78 }}
                    xScale={{ type: 'linear', min: 0, max: bi?.inventory.thresholds.autonomiaCapDias ?? 999 }}
                    yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
                    colors={scatterColor}
                    nodeSize={node => bubbleSize(node.data.capitalInmovilizadoCentavos)}
                    blendMode="normal"
                    useMesh
                    theme={nivoTheme}
                    axisBottom={{
                      legend: 'Autonomia de stock (dias)',
                      legendOffset: 50,
                      legendPosition: 'middle',
                      tickSize: 0,
                      tickPadding: 10,
                    }}
                    axisLeft={{
                      legend: 'ROI inventario (%)',
                      legendOffset: -62,
                      legendPosition: 'middle',
                      tickSize: 0,
                      tickPadding: 10,
                    }}
                    markers={[
                      {
                        axis: 'x',
                        value: bi?.inventory.thresholds.autonomiaAltaDias ?? 120,
                        lineStyle: { stroke: AUDI_YELLOW, strokeWidth: 1, strokeDasharray: '6 6' },
                      },
                      {
                        axis: 'y',
                        value: bi?.inventory.thresholds.roiBajoPorcentaje ?? 20,
                        lineStyle: { stroke: AUDI_YELLOW, strokeWidth: 1, strokeDasharray: '6 6' },
                      },
                    ]}
                    tooltip={({ node }) => (
                      <div className="rounded-lg border border-white/10 bg-[#111111]/95 px-4 py-3 text-sm text-white shadow-2xl">
                        <strong className="block max-w-72 truncate">{node.data.nombre}</strong>
                        <span className="mt-2 block text-white/60">{node.data.categoria ?? 'Sin categoria'}</span>
                        <div className="mt-2 grid gap-1 text-white/70">
                          <span>Autonomia: {node.data.autonomiaDiasRaw ?? node.data.x} dias</span>
                          <span>ROI: {node.data.roiInventarioPorcentaje}%</span>
                          <span>Capital: {formatBsFromCentavos(node.data.capitalInmovilizadoCentavos)}</span>
                          <span>Recencia: {node.data.recenciaDias ?? 'sin ventas'} dias</span>
                        </div>
                      </div>
                    )}
                  />
                </div>
              ) : (
                <EmptyState>Sin inventario activo para graficar.</EmptyState>
              )}
            </ChartPanel>

            <ChartPanel eyebrow="Riesgo" title="Bolsas de capital inmovilizado">
              <div className="overflow-hidden rounded-lg border border-white/10">
                {deadStockItems.slice(0, 8).map(item => (
                  <div key={item.productoId} className="grid gap-2 border-b border-white/10 bg-white/[0.025] p-3 last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="min-w-0 truncate text-sm text-white">{item.nombre}</strong>
                      <span className="rounded bg-audi-red px-2 py-1 text-xs font-bold text-white">
                        {formatBsFromCentavos(item.capitalInmovilizadoCentavos)}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-white/45">
                      {item.recenciaDias === null ? 'Sin venta registrada' : `${item.recenciaDias} dias sin venta`} / stock {item.stockActual}
                    </span>
                  </div>
                ))}
                {!deadStockItems.length && (
                  <div className="p-8 text-center text-sm font-semibold text-white/45">Sin stock muerto critico.</div>
                )}
              </div>
            </ChartPanel>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <ChartPanel eyebrow="Pareto" title="Margen real por categoria">
              {paretoData.length ? (
                <div className="h-[390px] overflow-x-auto">
                  <div className="h-full min-w-[720px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={80}>
                      <BarChart data={paretoData} margin={{ top: 14, right: 18, bottom: 16, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="shortCategoria" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis tickFormatter={percentTick} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ParetoTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <ReferenceLine y={0} stroke={GRID} />
                        <Bar
                          dataKey="margenGananciaPorcentaje"
                          name="Margen real"
                          shape={(props: unknown) => <VariableWidthParetoBar {...(props as VariableWidthBarProps)} />}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <EmptyState>Sin ventas para calcular Pareto.</EmptyState>
              )}
            </ChartPanel>

            <ChartPanel eyebrow="Precio" title={`Cascada de valor ${bi?.waterfall.month ?? ''}`}>
              {waterfallData.length ? (
                <div className="h-[390px] overflow-x-auto">
                  <div className="h-full min-w-[680px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={80}>
                      <BarChart data={waterfallData} margin={{ top: 14, right: 18, bottom: 16, left: 0 }}>
                        <CartesianGrid stroke={GRID} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis tickFormatter={moneyTick} tick={{ fill: AXIS, fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                        <ReferenceLine y={0} stroke={GRID} />
                        <Bar dataKey="range" radius={[4, 4, 4, 4]} name="Valor">
                          {waterfallData.map(step => (
                            <Cell
                              key={step.id}
                              fill={step.kind === 'negative' ? AUDI_RED : step.kind === 'total' ? AUDI_GREEN : '#8B949E'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <EmptyState>Sin ventas del mes para auditar precio.</EmptyState>
              )}
            </ChartPanel>
          </section>

          <section className="mt-5">
            <ChartPanel
              eyebrow="Comportamiento"
              title="Matriz termica de ventas"
              aside={
                <div className="inline-flex rounded-lg border border-white/10 bg-[#111111] p-1">
                  <button
                    type="button"
                    onClick={() => setHeatMetric('tickets')}
                    className={[
                      'h-8 rounded-md px-3 text-xs font-bold transition',
                      heatMetric === 'tickets' ? 'bg-audi-red text-white' : 'text-white/50 hover:text-white',
                    ].join(' ')}
                  >
                    Tickets
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeatMetric('utilidad')}
                    className={[
                      'h-8 rounded-md px-3 text-xs font-bold transition',
                      heatMetric === 'utilidad' ? 'bg-audi-red text-white' : 'text-white/50 hover:text-white',
                    ].join(' ')}
                  >
                    Utilidad
                  </button>
                </div>
              }
            >
              {heatmapData.length ? (
                <div className="h-[430px] min-w-0">
                  <ResponsiveHeatMap<HeatmapDatum, object>
                    data={heatmapData}
                    margin={{ top: 24, right: 24, bottom: 56, left: 92 }}
                    theme={nivoTheme}
                    colors={cell => heatColor(Number(cell.value ?? 0), heatMax)}
                    emptyColor="#151515"
                    borderColor="#111111"
                    borderWidth={3}
                    borderRadius={4}
                    xInnerPadding={0.02}
                    yInnerPadding={0.04}
                    enableLabels={false}
                    axisTop={null}
                    axisRight={null}
                    axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: 0 }}
                    axisLeft={{ tickSize: 0, tickPadding: 10 }}
                    tooltip={({ cell }) => {
                      const data = cell.data as HeatmapDatum;
                      return (
                        <div className="rounded-lg border border-white/10 bg-[#111111]/95 px-4 py-3 text-sm text-white shadow-2xl">
                          <strong className="block">{cell.serieId} / {data.x}</strong>
                          <div className="mt-2 grid gap-1 text-white/70">
                            <span>Tickets: {data.tickets}</span>
                            <span>Utilidad: {formatBsFromCentavos(data.utilidadCentavos)}</span>
                            <span>Ingresos: {formatBsFromCentavos(data.totalCentavos)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              ) : (
                <EmptyState>Sin ventas con horario operativo para matriz termica.</EmptyState>
              )}
            </ChartPanel>
          </section>
        </section>
      </div>
    </main>
  );
}
