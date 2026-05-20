import type {
  AnalyticsDashboard,
  InventoryHealthResponse,
  ParetoMarginResponse,
  PriceWaterfallResponse,
  SalesHeatmapResponse,
} from '@audidisc/shared';

import { apiJson } from '../../../api/client';

export async function fetchAnalyticsDashboard(params: {
  idToken: string | null;
}): Promise<AnalyticsDashboard> {
  return apiJson<AnalyticsDashboard>('/analytics/dashboard', { idToken: params.idToken });
}

export async function fetchInventoryHealth(params: {
  idToken: string | null;
}): Promise<InventoryHealthResponse> {
  return apiJson<InventoryHealthResponse>('/bi/inventory-health', { idToken: params.idToken });
}

export async function fetchParetoMargin(params: {
  idToken: string | null;
}): Promise<ParetoMarginResponse> {
  return apiJson<ParetoMarginResponse>('/bi/pareto-margin', { idToken: params.idToken });
}

export async function fetchPriceWaterfall(params: {
  idToken: string | null;
}): Promise<PriceWaterfallResponse> {
  return apiJson<PriceWaterfallResponse>('/bi/price-waterfall', { idToken: params.idToken });
}

export async function fetchSalesHeatmap(params: {
  idToken: string | null;
}): Promise<SalesHeatmapResponse> {
  return apiJson<SalesHeatmapResponse>('/bi/sales-heatmap', { idToken: params.idToken });
}
