import { describe, expect, it } from 'vitest';
import type { ProductPublic } from '@audidisc/shared';

import {
  buildSalePayload,
  calculateCartTotal,
  calculateChange,
  canAddProduct,
  type CartItem,
} from './cart';

const product: ProductPublic = {
  id: 'p1',
  nombre: 'Audifonos',
  marca: 'Sony',
  sku: 'AUD-1',
  categoria: 'Audio',
  cantidad: 2,
  stockMinimo: 1,
  precioVentaCentavos: 1500,
  estado: true,
  createdAt: null,
  updatedAt: null,
};

describe('cart helpers', () => {
  it('calculates totals and change in centavos', () => {
    const items: CartItem[] = [
      { product, quantity: 2, precioVendidoCentavos: 1500 },
    ];

    expect(calculateCartTotal(items)).toBe(3000);
    expect(calculateChange(5000, 3000)).toBe(2000);
  });

  it('builds the backend sale payload with sold price snapshots', () => {
    const payload = buildSalePayload(
      [{ product, quantity: 1, precioVendidoCentavos: 1500 }],
      2000,
      'Efectivo',
    );

    expect(payload.productos[0]).toEqual({
      productoId: 'p1',
      cantidad: 1,
      precioVendidoCentavos: 1500,
    });
    expect(payload.totalCentavos).toBe(1500);
  });

  it('prevents adding more than available stock', () => {
    expect(canAddProduct([], product)).toBe(true);
    expect(
      canAddProduct(
        [{ product, quantity: 2, precioVendidoCentavos: 1500 }],
        product,
      ),
    ).toBe(false);
  });
});

