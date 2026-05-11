import type { ReportsDashboard, Sale, SalesHistory, UserRole } from '@audidisc/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

function authHeaders(idToken: string | null): HeadersInit {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }
  return { Authorization: `Bearer ${idToken}` };
}

async function downloadPdf(response: Response, filename: string) {
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo generar PDF');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function fetchReportsDashboard(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<ReportsDashboard> {
  void params.role;
  const response = await fetch(`${API_BASE_URL}/reports/dashboard`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar el dashboard de reportes');
  }
  return response.json() as Promise<ReportsDashboard>;
}

export async function fetchSalesHistory(params: {
  idToken: string | null;
  role: UserRole;
  dateFrom: string;
  dateTo: string;
}): Promise<SalesHistory> {
  void params.role;
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const response = await fetch(`${API_BASE_URL}/sales/history?${query.toString()}`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar el historial de ventas');
  }
  return response.json() as Promise<SalesHistory>;
}

export async function voidSale(params: {
  idToken: string | null;
  saleId: string;
}): Promise<Sale> {
  const response = await fetch(`${API_BASE_URL}/sales/${encodeURIComponent(params.saleId)}/void`, {
    method: 'POST',
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo anular la venta');
  }
  return response.json() as Promise<Sale>;
}

export async function downloadCashClosePdf(params: {
  idToken: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const response = await fetch(`${API_BASE_URL}/reports/cash-close.pdf?${query.toString()}`, {
    headers: authHeaders(params.idToken),
  });
  await downloadPdf(response, `audi-disc-cierre-${params.dateFrom}-${params.dateTo}.pdf`);
}

