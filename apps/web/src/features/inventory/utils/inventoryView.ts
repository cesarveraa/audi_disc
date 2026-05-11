import type { Product } from '@audidisc/shared';
import { filterProducts, getStockStatus, hasAdminFinancials } from '@audidisc/shared';

export function filterInventoryProducts<T extends Product>(products: T[], query: string): T[] {
  return filterProducts(products, query);
}

export function canDisplayFinancials(product: Product, isAdmin: boolean): boolean {
  return isAdmin && hasAdminFinancials(product);
}

export function getStockLabel(product: Product): string {
  const status = getStockStatus(product);
  if (status === 'critical') {
    return 'Critico';
  }
  if (status === 'low') {
    return 'Bajo';
  }
  if (status === 'inactive') {
    return 'Inactivo';
  }
  return 'Saludable';
}

