import type { ReportsDashboard, Sale, SalesHistory, UserRole } from '@audidisc/shared';

import { apiBlob, apiJson } from '../../../api/client';

export type ProductReportFilters = {
  q?: string;
  marca?: string;
  categoria?: string;
  estado?: 'active' | 'inactive' | 'all';
  stock?: 'all' | 'healthy' | 'low' | 'critical' | 'inactive';
  dateFrom?: string;
  dateTo?: string;
};

export type SalesReportFilters = {
  dateFrom: string;
  dateTo: string;
  producto?: string;
  metodo?: '' | 'Efectivo' | 'QR' | 'Transferencia';
};

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

function appendOptional(query: URLSearchParams, key: string, value: string | undefined | null) {
  const trimmed = value?.trim();
  if (trimmed) {
    query.set(key, trimmed);
  }
}

function productReportQuery(filters: ProductReportFilters = {}) {
  const query = new URLSearchParams();
  appendOptional(query, 'q', filters.q);
  appendOptional(query, 'marca', filters.marca);
  appendOptional(query, 'categoria', filters.categoria);
  appendOptional(query, 'dateFrom', filters.dateFrom);
  appendOptional(query, 'dateTo', filters.dateTo);
  query.set('stock', filters.stock ?? 'all');
  if (filters.estado === 'all') {
    return query;
  }
  query.set('estado', filters.estado === 'inactive' ? 'false' : 'true');
  return query;
}

function salesReportQuery(filters: SalesReportFilters) {
  const query = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  appendOptional(query, 'producto', filters.producto);
  appendOptional(query, 'metodo', filters.metodo);
  return query;
}

function filenamePart(value: string | undefined, fallback: string) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
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
  filters?: SalesReportFilters;
  dateFrom?: string;
  dateTo?: string;
}): Promise<SalesHistory> {
  void params.role;
  if (params.filters) {
    const query = salesReportQuery(params.filters);
    return apiJson<SalesHistory>(`/reports/sales-history?${query.toString()}`, { idToken: params.idToken });
  }
  const query = new URLSearchParams({
    dateFrom: params.dateFrom ?? '',
    dateTo: params.dateTo ?? '',
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
  filters: SalesReportFilters;
}) {
  const query = salesReportQuery(params.filters);
  const blob = await apiBlob(`/reports/cash-close.pdf?${query.toString()}`, {
    idToken: params.idToken,
  });
  await downloadFile(blob, `audi-disc-cierre-${params.filters.dateFrom}-${params.filters.dateTo}.pdf`);
}

export async function downloadProductsExcel(params: { idToken: string | null; filters?: ProductReportFilters }) {
  const query = productReportQuery(params.filters);
  const blob = await apiBlob(`/reports/products.xlsx?${query.toString()}`, { idToken: params.idToken });
  await downloadFile(blob, `audi-disc-productos-${filenamePart(params.filters?.q, 'filtrado')}.xlsx`);
}

export async function downloadProductsPdf(params: { idToken: string | null; filters?: ProductReportFilters }) {
  const query = productReportQuery(params.filters);
  const blob = await apiBlob(`/reports/products.pdf?${query.toString()}`, { idToken: params.idToken });
  await downloadFile(blob, `audi-disc-productos-${filenamePart(params.filters?.q, 'filtrado')}.pdf`);
}

export async function downloadSalesExcel(params: {
  idToken: string | null;
  filters: SalesReportFilters;
}) {
  const query = salesReportQuery(params.filters);
  const blob = await apiBlob(`/reports/sales.xlsx?${query.toString()}`, {
    idToken: params.idToken,
  });
  await downloadFile(blob, `audi-disc-ventas-${params.filters.dateFrom}-${params.filters.dateTo}.xlsx`);
}

export async function downloadSalesPdf(params: {
  idToken: string | null;
  filters: SalesReportFilters;
}) {
  const query = salesReportQuery(params.filters);
  const blob = await apiBlob(`/reports/sales.pdf?${query.toString()}`, {
    idToken: params.idToken,
  });
  await downloadFile(blob, `audi-disc-ventas-${params.filters.dateFrom}-${params.filters.dateTo}.pdf`);
}
