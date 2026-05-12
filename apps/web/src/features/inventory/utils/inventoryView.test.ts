import { describe, expect, it } from 'vitest';
import type { ProductAdmin } from '@audidisc/shared';

import {
  canDisplayFinancials,
  filterInventoryProducts,
} from '@features/inventory/utils/inventoryView';

const products: ProductAdmin[] = [
  {
    id: '1',
    nombre: 'Audifonos Studio Max',
    marca: 'Sony',
    sku: 'AUD-STUDIO-MAX',
    categoria: 'Audio',
    cantidad: 10,
    stockMinimo: 3,
    precioCompraCentavos: 1000,
    precioVentaCentavos: 1500,
    imagenUrl: null,
    utilidadCentavos: 500,
    margenPorcentaje: 33.33,
    estado: true,
    createdAt: null,
    updatedAt: null,
  },
  {
    id: '2',
    nombre: 'Cable USB-C',
    marca: 'Anker',
    sku: 'CAB-USBC',
    categoria: 'Accesorios',
    cantidad: 1,
    stockMinimo: 5,
    precioCompraCentavos: 300,
    precioVentaCentavos: 700,
    imagenUrl: null,
    utilidadCentavos: 400,
    margenPorcentaje: 57.14,
    estado: true,
    createdAt: null,
    updatedAt: null,
  },
];

describe('inventory view helpers', () => {
  it('filters products by name, brand, sku and category', () => {
    expect(filterInventoryProducts(products, 'studio')).toHaveLength(1);
    expect(filterInventoryProducts(products, 'anker')).toHaveLength(1);
    expect(filterInventoryProducts(products, 'CAB-USBC')).toHaveLength(1);
    expect(filterInventoryProducts(products, 'accesorios')).toHaveLength(1);
  });

  it('shows financial fields only for administrators', () => {
    expect(canDisplayFinancials(products[0], true)).toBe(true);
    expect(canDisplayFinancials(products[0], false)).toBe(false);
  });
});
