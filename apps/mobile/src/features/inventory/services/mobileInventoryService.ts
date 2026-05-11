import type { Product, ProductPublic, ProductUpdateInput } from '@audidisc/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

export async function fetchMobileInventory(idToken: string | null): Promise<ProductPublic[]> {
  if (!idToken) {
    throw new Error('Sesion Firebase requerida');
  }

  const response = await fetch(`${API_BASE_URL}/productos?estado=true`, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!response.ok) {
    throw new Error('No se pudo cargar inventario movil');
  }
  return response.json() as Promise<ProductPublic[]>;
}

export async function updateMobileProduct(params: {
  idToken: string | null;
  productId: string;
  payload: ProductUpdateInput;
}): Promise<Product> {
  if (!params.idToken) {
    throw new Error('Sesion Firebase requerida');
  }

  const response = await fetch(`${API_BASE_URL}/productos/${encodeURIComponent(params.productId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify(params.payload),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo actualizar producto');
  }
  return response.json() as Promise<Product>;
}
