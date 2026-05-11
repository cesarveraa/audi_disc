import type { PaymentMethod, Product, SaleCreateInput } from '@audidisc/shared';

export type CartItem = {
  product: Product;
  quantity: number;
  precioVendidoCentavos: number;
};

export function calculateCartTotal(items: CartItem[]): number {
  return items.reduce(
    (total, item) => total + item.quantity * item.precioVendidoCentavos,
    0,
  );
}

export function calculateChange(recibidoCentavos: number, totalCentavos: number): number {
  return recibidoCentavos - totalCentavos;
}

export function buildSalePayload(
  items: CartItem[],
  recibidoCentavos: number,
  metodo: PaymentMethod,
  clienteId?: string | null,
): SaleCreateInput {
  const totalCentavos = calculateCartTotal(items);
  return {
    productos: items.map(item => ({
      productoId: item.product.id,
      cantidad: item.quantity,
      precioVendidoCentavos: item.precioVendidoCentavos,
    })),
    totalCentavos,
    recibidoCentavos,
    metodo,
    clienteId: clienteId ?? null,
  };
}

export function canAddProduct(items: CartItem[], product: Product): boolean {
  const current = items.find(item => item.product.id === product.id)?.quantity ?? 0;
  return product.estado && product.cantidad > current;
}
