import type { PaymentMethod, ProductPublic, Sale, SaleCreateInput } from '@audidisc/shared';

import { mobileApiJson } from '../../../api/client';

export type MobileCartItem = {
  product: ProductPublic;
  quantity: number;
};

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

  return mobileApiJson<Sale>('/sales/checkout', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}
