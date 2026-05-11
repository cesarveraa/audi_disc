import { AlertTriangle, PackageCheck, TrendingUp } from 'lucide-react';
import type { DashboardSummary as DashboardSummaryModel } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { SalesChart } from './SalesChart';

type Props = {
  dashboard: DashboardSummaryModel | null;
};

export function DashboardSummary({ dashboard }: Props) {
  const sales = dashboard?.ventasHoy;
  const alerts = dashboard?.stockBajo ?? [];
  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]" aria-label="Resumen operativo">
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-1">
        <article className="rounded-panel border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gray-950 text-white">
              <TrendingUp size={21} />
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
              {sales?.cantidadVentas ?? 0} ventas
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            Ventas hoy
          </p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight text-gray-950">
            {formatBsFromCentavos(sales?.totalCentavos ?? 0)}
          </strong>
          <span className="mt-2 block text-sm font-medium text-gray-500">
            Total validado en caja
          </span>
        </article>

        <article className="rounded-panel border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-xl">
          <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-gray-100 text-gray-900">
            <PackageCheck size={21} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            Ticket promedio
          </p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight text-gray-950">
            {formatBsFromCentavos(sales?.ticketPromedioCentavos ?? 0)}
          </strong>
          <span className="mt-2 block text-sm font-medium text-gray-500">
            Promedio por venta
          </span>
        </article>

        <article className="rounded-panel bg-audi-red p-5 text-white shadow-button">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-white">
              <AlertTriangle size={21} />
            </div>
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
              Accion requerida
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/85">
            Stock critico
          </p>
          <strong className="mt-2 block text-3xl font-semibold tracking-tight text-white">
            {criticalAlerts.length}
          </strong>
          <span className="mt-2 block text-sm font-medium text-white/85">
            Productos agotados o en riesgo
          </span>
        </article>
      </div>

      <div className="grid gap-4">
        <SalesChart />
        <article className="rounded-panel border border-white/70 bg-white/90 p-5 shadow-card backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Alertas
              </p>
              <h2 className="mt-1 text-xl font-semibold text-gray-950">Stock critico</h2>
            </div>
            <span className="rounded-full bg-audi-red px-3 py-1 text-xs font-semibold text-white">
              {alerts.length}
            </span>
          </div>
          <div className="grid gap-2">
            {alerts.slice(0, 3).map(alert => (
              <div
                key={alert.producto.id}
                className={[
                  'flex items-center justify-between gap-3 rounded-2xl border p-3',
                  alert.severity === 'critical'
                    ? 'border-audi-red/20 bg-audi-red text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-900',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <strong className="block truncate text-sm">{alert.producto.nombre}</strong>
                  <span
                    className={[
                      'block text-xs font-medium',
                      alert.severity === 'critical' ? 'text-white/85' : 'text-gray-500',
                    ].join(' ')}
                  >
                    {alert.producto.marca ?? 'Sin marca'}
                  </span>
                </div>
                <span className="text-sm font-semibold">{alert.producto.cantidad}</span>
              </div>
            ))}
            {!alerts.length && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-medium text-gray-500">
                Inventario saludable.
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
