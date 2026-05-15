import type { ReportsDashboard, Sale, SalesHistory, UserRole } from '@audidisc/shared';

import { apiBlob, apiJson } from '../../../api/client';

async function downloadFile(blob: Blob, filename: string) {
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
  return apiJson<ReportsDashboard>('/reports/dashboard', { idToken: params.idToken });
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
  return apiJson<SalesHistory>(`/sales/history?${query.toString()}`, { idToken: params.idToken });
}

export async function voidSale(params: {
  idToken: string | null;
  saleId: string;
}): Promise<Sale> {
  return apiJson<Sale>(`/sales/${encodeURIComponent(params.saleId)}/void`, {
    idToken: params.idToken,
    method: 'POST',
  });
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
  const blob = await apiBlob(`/reports/cash-close.pdf?${query.toString()}`, {
    idToken: params.idToken,
  });
  await downloadFile(blob, `audi-disc-cierre-${params.dateFrom}-${params.dateTo}.pdf`);
}

export async function downloadProductsExcel(params: { idToken: string | null }) {
  const blob = await apiBlob('/reports/products.xlsx', { idToken: params.idToken });
  await downloadFile(blob, 'audi-disc-productos.xlsx');
}

export async function downloadProductsPdf(params: { idToken: string | null }) {
  const blob = await apiBlob('/reports/products.pdf', { idToken: params.idToken });
  await downloadFile(blob, 'audi-disc-productos.pdf');
}

export async function downloadSalesExcel(params: {
  idToken: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const blob = await apiBlob(`/reports/sales.xlsx?${query.toString()}`, {
    idToken: params.idToken,
  });
  await downloadFile(blob, `audi-disc-ventas-${params.dateFrom}-${params.dateTo}.xlsx`);
}

export async function downloadSalesPdf(params: {
  idToken: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  const blob = await apiBlob(`/reports/sales.pdf?${query.toString()}`, {
    idToken: params.idToken,
  });
  await downloadFile(blob, `audi-disc-ventas-${params.dateFrom}-${params.dateTo}.pdf`);
}
