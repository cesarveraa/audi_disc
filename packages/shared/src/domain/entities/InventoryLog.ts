import type { Product } from './Product';

export type InventoryMovementType = 'entrada' | 'ajuste';

export interface InventoryUpdateInput {
  productoId: string;
  tipo: InventoryMovementType;
  cantidadDelta: number;
  motivo?: string | null;
  referencia?: string | null;
}

export interface InventoryLog {
  id: string;
  productoId: string;
  productoNombre: string;
  tipo: InventoryMovementType;
  cantidadAnterior: number;
  cantidadDelta: number;
  cantidadNueva: number;
  motivo: string | null;
  referencia: string | null;
  createdBy: string;
  createdAt: string | null;
}

export interface InventoryUpdateResult {
  producto: Product;
  log: InventoryLog;
}
