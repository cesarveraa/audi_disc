export type PaymentMethod = 'Efectivo' | 'Qr' | 'Transferencia';

export interface SaleItemInput {
  productoId: string;
  cantidad: number;
  precioVendidoCentavos: number;
}

export interface SaleItemSnapshot {
  productoId: string;
  nombre: string;
  marca: string | null;
  sku: string | null;
  categoria: string | null;
  cantidad: number;
  precioVentaCentavos: number;
  precioVendidoCentavos: number;
  subtotalCentavos: number;
  precioCompraCentavos?: number;
  utilidadCentavos?: number;
}

export interface SaleCreateInput {
  productos: SaleItemInput[];
  totalCentavos: number;
  recibidoCentavos: number;
  metodo: PaymentMethod;
  clienteId?: string | null;
}

export interface Sale {
  id: string;
  productos: SaleItemSnapshot[];
  totalCentavos: number;
  recibidoCentavos: number;
  cambioCentavos: number;
  metodo: PaymentMethod;
  fechaLocal: string;
  horaLocal: string;
  estado: boolean;
  createdBy: string;
  createdAt: string | null;
  clienteId?: string | null;
  clienteSnapshot?: {
    id: string;
    nombre: string;
    telefono: string;
  } | null;
}
