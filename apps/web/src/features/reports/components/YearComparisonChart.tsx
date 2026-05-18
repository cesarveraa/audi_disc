import type { YearComparisonPoint } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

type Props = {
  data: YearComparisonPoint[];
};

export function YearComparisonChart({ data }: Props) {
  const max = Math.max(
    100,
    ...data.flatMap(point => [point.currentTotalCentavos, point.previousTotalCentavos]),
  );

  return (
    <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
            Migracion RPA
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Comparativa Interanual</h2>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-white/10 dark:text-white/60">
          {data[0]?.previousYear ?? '-'} vs {data[0]?.currentYear ?? '-'}
        </span>
      </div>

      <div className="grid gap-3">
        {data.map(point => {
          const previousWidth = `${Math.max(2, (point.previousTotalCentavos / max) * 100)}%`;
          const currentWidth = `${Math.max(2, (point.currentTotalCentavos / max) * 100)}%`;
          return (
            <div key={point.mes} className="grid grid-cols-[42px_minmax(0,1fr)_96px] items-center gap-3">
              <span className="text-xs font-bold uppercase text-gray-500 dark:text-white/50">{point.label}</span>
              <div className="grid gap-1">
                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                  <div className="h-full rounded-full bg-gray-300 dark:bg-white/35" style={{ width: previousWidth }} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-red-50 dark:bg-audi-red/15">
                  <div className="h-full rounded-full bg-audi-red" style={{ width: currentWidth }} />
                </div>
              </div>
              <div className="text-right">
                <strong className="block text-xs font-semibold text-gray-950 dark:text-white">
                  {formatBsFromCentavos(point.currentTotalCentavos)}
                </strong>
                <span className={`text-[11px] font-bold ${point.deltaPorcentaje >= 0 ? 'text-green-600' : 'text-audi-red'}`}>
                  {point.deltaPorcentaje >= 0 ? '+' : ''}{point.deltaPorcentaje}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
