import type { ReportsDashboard } from '@audidisc/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function fetchMobileReportsDashboard(idToken: string | null): Promise<ReportsDashboard> {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }

  const response = await fetch(`${API_BASE_URL}/reports/dashboard`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo cargar reportes moviles');
  }

  return response.json() as Promise<ReportsDashboard>;
}
