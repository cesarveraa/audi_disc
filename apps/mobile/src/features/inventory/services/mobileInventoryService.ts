import type { Product, ProductPublic, ProductUpdateInput } from '@audidisc/shared';

import { mobileApiJson } from '../../../api/client';

export async function fetchMobileInventory(idToken: string | null): Promise<ProductPublic[]> {
  return mobileApiJson<ProductPublic[]>('/productos?estado=true', { idToken });
}

export async function updateMobileProduct(params: {
  idToken: string | null;
  productId: string;
  payload: ProductUpdateInput;
}): Promise<Product> {
  return mobileApiJson<Product>(`/productos/${encodeURIComponent(params.productId)}`, {
    idToken: params.idToken,
    method: 'PATCH',
    json: params.payload,
  });
}
