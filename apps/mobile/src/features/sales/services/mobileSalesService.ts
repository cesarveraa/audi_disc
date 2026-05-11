import type { PaymentMethod, ProductPublic, Sale, SaleCreateInput } from '@audidisc/shared';

export type MobileCartItem = {
  product: ProductPublic;
  quantity: number;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

export function cartTotal(items: MobileCartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.product.precioVentaCentavos, 0);
}

export function buildMobileSalePayload(
  items: MobileCartItem[],
  recibidoCentavos: number,
  metodo: PaymentMethod,
  clienteId?: string | null,
): SaleCreateInput {
  return {
    productos: items.map(item => ({
      productoId: item.product.id,
      cantidad: item.quantity,
      precioVendidoCentavos: item.product.precioVentaCentavos,
    })),
    totalCentavos: cartTotal(items),
    recibidoCentavos,
    metodo,
    clienteId: clienteId ?? null,
  };
}

export async function registerMobileSale(params: {
  idToken: string | null;
  payload: SaleCreateInput;
}): Promise<Sale> {
  if (!params.idToken) {
    throw new Error('Sesion Firebase requerida');
  }

  const response = await fetch(`${API_BASE_URL}/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify(params.payload),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? 'No se pudo registrar la venta movil');
  }

  return response.json() as Promise<Sale>;
}
