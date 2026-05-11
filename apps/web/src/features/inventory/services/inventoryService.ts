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

export async function fetchInventoryProducts(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<Product[]> {
  void params.role;
  return apiJson<Product[]>('/productos?estado=true', { idToken: params.idToken });
}

export async function fetchDashboardSummary(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<DashboardSummary> {
  void params.role;
  return apiJson<DashboardSummary>('/dashboard/resumen-hoy', { idToken: params.idToken });
}

export async function createInventoryProduct(params: {
  idToken: string | null;
  payload: ProductCreateInput;
}): Promise<Product> {
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
  return apiJson<InventoryUpdateResult>('/inventory/update', {
    idToken: params.idToken,
    method: 'PATCH',
    json: params.payload,
  });
}

export function filterInventory(products: Product[], query: string): Product[] {
  return filterProducts(products, query);
}
