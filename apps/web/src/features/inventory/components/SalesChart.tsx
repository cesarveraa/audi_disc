import { formatBsFromCentavos } from '@audidisc/shared';

const chartData = [
  { label: '08', value: 8200 },
  { label: '10', value: 16400 },
  { label: '12', value: 12100 },
  { label: '14', value: 28600 },
  { label: '16', value: 22800 },
  { label: '18', value: 31200 },
  { label: '20', value: 19600 },
];

export function SalesChart() {
  const max = Math.max(...chartData.map(item => item.value));

  return (
    <div className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            Ritmo de ventas
          </p>
          <h2 className="mt-1 text-xl font-semibold text-gray-950">Hoy por hora</h2>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
          Live
        </span>
      </div>

      <div className="flex h-44 items-end gap-3">
        {chartData.map(item => (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-36 w-full items-end rounded-full bg-gray-100 p-1">
              <div
                className="w-full rounded-full bg-gray-900 transition-all duration-500 ease-out"
                style={{ height: `${Math.max(16, (item.value / max) * 100)}%` }}
                title={formatBsFromCentavos(item.value)}
              />
            </div>
            <span className="text-xs font-medium text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

