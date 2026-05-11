import type { Product, ProductStockStatus } from '../domain/entities/Product';

export function getStockStatus(product: Product): ProductStockStatus {
  if (!product.estado) {
    return 'inactive';
  }
  if (product.cantidad <= 0) {
    return 'critical';
  }
  if (product.cantidad <= product.stockMinimo) {
    return 'low';
  }
  return 'healthy';
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterProducts<T extends Product>(products: T[], query: string): T[] {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return products;
  }

  return products.filter(product => {
    const fields = [
      product.nombre,
      product.marca,
      product.sku,
      product.categoria,
    ];
    return fields.some(field => normalizeSearch(field).includes(normalized));
  });
}

export function calculateMarginPercent(precioCompraCentavos: number, precioVentaCentavos: number): number {
  if (precioVentaCentavos <= 0) {
    return 0;
  }
  return Math.round(((precioVentaCentavos - precioCompraCentavos) / precioVentaCentavos) * 10000) / 100;
}

