import type {
  DashboardSummary,
  InventoryUpdateInput,
  InventoryUpdateResult,
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  UserRole,
} from '@audidisc/shared';
import { filterProducts } from '@audidisc/shared';

import { apiJson } from '../../../api/client';

const PRODUCT_CACHE_TTL_MS = 60_000;
const DASHBOARD_CACHE_TTL_MS = 20_000;

let productsCache: { expiresAt: number; value: Product[] } | null = null;
let dashboardCache: { expiresAt: number; value: DashboardSummary } | null = null;
let productsRequest: Promise<Product[]> | null = null;
let dashboardRequest: Promise<DashboardSummary> | null = null;

function rememberProducts(products: Product[]) {
  productsCache = { expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS, value: products };
}

function rememberDashboard(dashboard: DashboardSummary) {
  dashboardCache = { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, value: dashboard };
}

function clearInventoryCache() {
  productsCache = null;
  dashboardCache = null;
  productsRequest = null;
  dashboardRequest = null;
}

export async function fetchInventoryProducts(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<Product[]> {
  void params.role;
  if (productsCache && productsCache.expiresAt > Date.now()) {
    return productsCache.value;
  }
  if (productsRequest) {
    return productsRequest;
  }
  try {
    productsRequest = apiJson<Product[]>('/productos?estado=true', { idToken: params.idToken })
      .then(products => {
        rememberProducts(products);
        return products;
      })
      .finally(() => {
        productsRequest = null;
      });
    return await productsRequest;
  } catch (error) {
    if (productsCache) {
      return productsCache.value;
    }
    throw error;
  }
}

export async function fetchDashboardSummary(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<DashboardSummary> {
  void params.role;
  if (dashboardCache && dashboardCache.expiresAt > Date.now()) {
    return dashboardCache.value;
  }
  if (dashboardRequest) {
    return dashboardRequest;
  }
  try {
    dashboardRequest = apiJson<DashboardSummary>('/dashboard/resumen-hoy', { idToken: params.idToken })
      .then(dashboard => {
        rememberDashboard(dashboard);
        return dashboard;
      })
      .finally(() => {
        dashboardRequest = null;
      });
    return await dashboardRequest;
  } catch (error) {
    if (dashboardCache) {
      return dashboardCache.value;
    }
    throw error;
  }
}

export async function createInventoryProduct(params: {
  idToken: string | null;
  payload: ProductCreateInput;
}): Promise<Product> {
  clearInventoryCache();
  return apiJson<Product>('/productos', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}

export async function updateInventoryProduct(params: {
  idToken: string | null;
  productId: string;
  payload: ProductUpdateInput;
}): Promise<Product> {
  clearInventoryCache();
  return apiJson<Product>(`/productos/${encodeURIComponent(params.productId)}`, {
    idToken: params.idToken,
    method: 'PATCH',
    json: params.payload,
  });
}

export async function updateInventoryStock(params: {
  idToken: string | null;
  payload: InventoryUpdateInput;
}): Promise<InventoryUpdateResult> {
  clearInventoryCache();
  return apiJson<InventoryUpdateResult>('/inventory/update', {
    idToken: params.idToken,
    method: 'PATCH',
    json: params.payload,
  });
}

export function filterInventory(products: Product[], query: string): Product[] {
  return filterProducts(products, query);
}
