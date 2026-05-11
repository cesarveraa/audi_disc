import type { DashboardSummary, Product, UserRole } from '@audidisc/shared';
import { filterProducts } from '@audidisc/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

function authHeaders(idToken: string | null): HeadersInit {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }
  return { Authorization: `Bearer ${idToken}` };
}

export async function fetchInventoryProducts(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<Product[]> {
  void params.role;
  const response = await fetch(`${API_BASE_URL}/productos?estado=true`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar inventario');
  }
  return response.json() as Promise<Product[]>;
}

export async function fetchDashboardSummary(params: {
  idToken: string | null;
  role: UserRole;
}): Promise<DashboardSummary> {
  void params.role;
  const response = await fetch(`${API_BASE_URL}/dashboard/resumen-hoy`, {
    headers: authHeaders(params.idToken),
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar resumen');
  }
  return response.json() as Promise<DashboardSummary>;
}

export function filterInventory(products: Product[], query: string): Product[] {
  return filterProducts(products, query);
}

