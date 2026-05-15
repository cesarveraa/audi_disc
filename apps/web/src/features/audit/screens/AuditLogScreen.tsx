import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Database,
  History,
  RefreshCw,
} from 'lucide-react';
import type { AuditAction, AuditLog, AuditLogsPage } from '@audidisc/shared';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppSidebar } from '@app/navigation/AppSidebar';
import { AppButton } from '@core/ui/AppButton';
import { fetchAuditLogs } from '@features/audit/services/auditService';

const PAGE_SIZE = 20;

const actionStyles: Record<AuditAction, string> = {
  UPDATE: 'bg-gray-100 text-gray-700',
  DELETE: 'bg-gray-950 text-white',
  PRICE_CHANGE: 'bg-audi-red text-white',
  STOCK_ADJUST: 'bg-red-50 text-audi-red',
};

function formatDate(value: string | null) {
  if (!value) {
    return 'Sin fecha';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  }).format(date);
}

function stringifyValue(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return 'Sin dato';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function changedFields(log: AuditLog) {
  return Array.from(
    new Set([
      ...Object.keys(log.previous_data ?? {}),
      ...Object.keys(log.new_data ?? {}),
    ]),
  );
}

export default function AuditLogScreen() {
  const { idToken, logout, user } = useRequiredAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogsPage | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAuditLogs({ idToken, page, limit: PAGE_SIZE }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar auditoria');
    } finally {
      setLoading(false);
    }
  }, [idToken, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total_count ?? 0) / PAGE_SIZE)),
    [data],
  );

  return (
    <main className="ad-page">
      <div className="ad-shell">
        <AppSidebar active="audit" user={user} onLogout={logout} />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <a href="/reportes" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-950">
                <ArrowLeft className="h-4 w-4" />
                Volver a reportes
              </a>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Integridad de datos</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Historial de Auditoria
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500">
                Cambios sensibles de productos, stock y ventas con usuario, accion y diferencias exactas.
              </p>
            </div>
            <AppButton
              variant="primary"
              icon={<RefreshCw className="h-4 w-4" />}
              isLoading={isLoading}
              onClick={() => void loadLogs()}
            >
              Actualizar
            </AppButton>
          </header>

          {error && <div className="mb-5 rounded-panel bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}

          <section className="mb-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Registros</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950">{data?.total_count ?? 0}</strong>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl">
              <span className="text-sm font-semibold text-gray-500">Pagina actual</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950">{page} / {totalPages}</strong>
            </article>
            <article className="rounded-panel bg-gray-950 p-5 text-white shadow-card">
              <span className="text-sm font-semibold text-white/70">Proteccion</span>
              <strong className="mt-2 flex items-center gap-2 text-2xl font-semibold">
                <Database className="h-5 w-5 text-audi-red" />
                Admin only
              </strong>
            </article>
          </section>

          <section className="rounded-panel border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur-xl sm:p-5">
            <div className="overflow-hidden rounded-panel border border-gray-100 bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-[980px] divide-y divide-gray-100 text-left">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Accion</th>
                      <th className="px-4 py-3">Entidad</th>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Campos cambiados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(data?.items ?? []).map(log => (
                      <tr key={log.id} className="align-top transition hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-gray-700">
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${actionStyles[log.action] ?? actionStyles.UPDATE}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <strong className="block text-gray-950">{log.entity}</strong>
                          <span className="mt-1 block font-mono text-xs text-gray-500">{log.entityId ?? 'sin-id'}</span>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <strong className="block text-gray-950">{log.userEmail ?? log.userId}</strong>
                          <span className="mt-1 block font-mono text-xs text-gray-500">{log.userId}</span>
                        </td>
                        <td className="min-w-[360px] px-4 py-4">
                          <div className="grid gap-2">
                            {changedFields(log).map(field => (
                              <div key={`${log.id}-${field}`} className="rounded-2xl bg-gray-50 p-3">
                                <div className="mb-2 flex items-center gap-2">
                                  <History className="h-4 w-4 text-audi-red" />
                                  <strong className="text-sm text-gray-950">{field}</strong>
                                </div>
                                <div className="grid gap-2 text-xs font-semibold text-gray-500 md:grid-cols-2">
                                  <span className="rounded-xl bg-white px-3 py-2">
                                    Antes: {stringifyValue(log.previous_data?.[field])}
                                  </span>
                                  <span className="rounded-xl bg-white px-3 py-2">
                                    Despues: {stringifyValue(log.new_data?.[field])}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {!changedFields(log).length && (
                              <span className="text-sm font-semibold text-gray-500">Sin diferencias serializadas.</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isLoading && (
                <div className="p-8 text-center text-sm font-semibold text-gray-500">Cargando auditoria...</div>
              )}
              {!isLoading && !(data?.items.length) && (
                <div className="p-8 text-center text-sm font-semibold text-gray-500">Sin eventos de auditoria registrados.</div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-gray-500">
                Mostrando {data?.items.length ?? 0} de {data?.total_count ?? 0} registros
              </span>
              <div className="flex gap-2">
                <AppButton
                  variant="neutral"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  disabled={page <= 1 || isLoading}
                  onClick={() => setPage(current => Math.max(1, current - 1))}
                >
                  Anterior
                </AppButton>
                <AppButton
                  variant="neutral"
                  icon={<ChevronRight className="h-4 w-4" />}
                  disabled={!data?.has_more || isLoading}
                  onClick={() => setPage(current => current + 1)}
                >
                  Siguiente
                </AppButton>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
