import { useMemo, useState } from 'react';
import type { WeeklyRevenuePoint } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

type Props = {
  data: WeeklyRevenuePoint[];
  showProfit: boolean;
};

type ChartPoint = WeeklyRevenuePoint & {
  x: number;
  y: number;
  weekday: string;
  shortDate: string;
};

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 405;
const PADDING = {
  top: 34,
  right: 28,
  bottom: 68,
  left: 72,
};

function formatWeekday(fechaLocal: string) {
  const [year, month, day] = fechaLocal.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('es-BO', { weekday: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase();
}

function roundAxisMax(value: number) {
  if (value <= 0) {
    return 1000;
  }
  const magnitude = value >= 100000 ? 10000 : 1000;
  return Math.ceil((value * 1.16) / magnitude) * magnitude;
}

export function WeeklyRevenueChart({ data, showProfit }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const baseline = VIEWBOX_HEIGHT - PADDING.bottom;
    const graphWidth = VIEWBOX_WIDTH - PADDING.left - PADDING.right;
    const graphHeight = VIEWBOX_HEIGHT - PADDING.top - PADDING.bottom;
    const max = roundAxisMax(Math.max(0, ...data.map(point => point.totalCentavos)));

    const points: ChartPoint[] = data.map((point, index) => {
      const x =
        data.length === 1
          ? PADDING.left + graphWidth / 2
          : PADDING.left + (index / Math.max(1, data.length - 1)) * graphWidth;
      const y = baseline - (point.totalCentavos / max) * graphHeight;

      return {
        ...point,
        x,
        y,
        weekday: formatWeekday(point.fechaLocal),
        shortDate: point.fechaLocal.slice(5),
      };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ');
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baseline} L ${points[0].x.toFixed(2)} ${baseline} Z`
      : '';
    const ticks = Array.from({ length: 4 }, (_item, index) => {
      const ratio = index / 3;
      const value = max * (1 - ratio);
      return {
        value,
        y: PADDING.top + graphHeight * ratio,
      };
    });

    return { baseline, graphHeight, linePath, areaPath, max, points, ticks };
  }, [data]);

  const activePoint = activeIndex === null ? null : chart.points[activeIndex] ?? null;

  return (
    <article className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
            RegistroDias
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Ventas de la semana</h2>
          <p className="mt-1 text-sm font-medium text-gray-500 dark:text-white/55">
            Montos diarios acumulados por fecha local.
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-white/60">
          {data.length} dias
        </span>
      </div>

      <div className="relative aspect-video w-full overflow-visible rounded-2xl border border-gray-100 bg-[linear-gradient(180deg,#ffffff_0%,#f7f8fa_100%)] p-2 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_100%)]">
        {activePoint && (
          <div
            className="pointer-events-none absolute z-20 min-w-44 rounded-2xl border border-gray-100 bg-white/95 px-4 py-3 text-left shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-gray-950/95"
            style={{
              left: `${(activePoint.x / VIEWBOX_WIDTH) * 100}%`,
              top: `${(activePoint.y / VIEWBOX_HEIGHT) * 100}%`,
              transform:
                activePoint.x < 150
                  ? 'translate(0,-118%)'
                  : activePoint.x > VIEWBOX_WIDTH - 150
                    ? 'translate(-100%,-118%)'
                    : 'translate(-50%,-118%)',
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-white/55">
              {activePoint.weekday} / {activePoint.shortDate}
            </span>
            <strong className="mt-1 block text-lg font-semibold text-gray-950 dark:text-white">
              {formatBsFromCentavos(activePoint.totalCentavos)}
            </strong>
            <span className="mt-1 block text-xs font-semibold text-gray-500 dark:text-white/55">
              {activePoint.cantidadVentas} ventas
              {showProfit ? ` / Utilidad ${formatBsFromCentavos(activePoint.utilidadCentavos ?? 0)}` : ''}
            </span>
          </div>
        )}

        <svg
          className="h-full w-full"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="img"
          aria-label="Ventas de la semana por dia"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id="weeklyRevenueArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#E4002B" stopOpacity="0.24" />
              <stop offset="70%" stopColor="#E4002B" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#E4002B" stopOpacity="0" />
            </linearGradient>
            <filter id="weeklyRevenueGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#E4002B" floodOpacity="0.18" />
            </filter>
          </defs>

          <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="transparent" />

          {chart.ticks.map(tick => (
            <g key={tick.y}>
              <line
                x1={PADDING.left}
                x2={VIEWBOX_WIDTH - PADDING.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#E5E7EB"
                strokeDasharray="5 7"
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 14}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-gray-400 text-[11px] font-semibold"
              >
                {formatBsFromCentavos(Math.round(tick.value)).replace('Bs ', '')}
              </text>
            </g>
          ))}

          {chart.areaPath && <path d={chart.areaPath} fill="url(#weeklyRevenueArea)" />}
          {chart.linePath && (
            <path
              d={chart.linePath}
              fill="none"
              stroke="#E4002B"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="4"
              filter="url(#weeklyRevenueGlow)"
            />
          )}

          {chart.points.map((point, index) => (
            <g
              key={point.fechaLocal}
              tabIndex={0}
              role="button"
              aria-label={`${point.weekday} ${formatBsFromCentavos(point.totalCentavos)}`}
              className="cursor-pointer outline-none"
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <line
                x1={point.x}
                x2={point.x}
                y1={PADDING.top}
                y2={chart.baseline}
                stroke={activeIndex === index ? '#E4002B' : 'transparent'}
                strokeDasharray="4 7"
                strokeWidth="1.5"
              />
              <circle cx={point.x} cy={point.y} r="16" fill="transparent" />
              <circle
                cx={point.x}
                cy={point.y}
                r={activeIndex === index ? 7 : 5}
                fill="#FFFFFF"
                stroke="#E4002B"
                strokeWidth="3"
              />
              <text
                x={point.x}
                y={chart.baseline + 34}
                textAnchor="middle"
                className="fill-gray-500 text-[12px] font-bold"
              >
                {point.weekday}
              </text>
              <text
                x={point.x}
                y={chart.baseline + 52}
                textAnchor="middle"
                className="fill-gray-400 text-[10px] font-semibold"
              >
                {point.shortDate}
              </text>
            </g>
          ))}
        </svg>

        {!data.length && (
          <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-gray-500">
            Sin datos de ventas para graficar.
          </div>
        )}
      </div>
    </article>
  );
}
