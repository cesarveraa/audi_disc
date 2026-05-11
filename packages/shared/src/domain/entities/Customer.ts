import type { Sale } from './Sale';

export interface Customer {
  id: string;
  nombre: string;
  telefono: string;
  estado: boolean;
  comprasCount: number;
  totalCompradoCentavos: number;
  ultimaCompraAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CustomerCreateInput {
  nombre: string;
  telefono: string;
}

export interface CustomerUpdateInput {
  nombre?: string;
  telefono?: string;
  estado?: boolean;
}

export interface CustomerSalesHistory {
  cliente: Customer;
  ventas: Sale[];
  totalCentavos: number;
  cantidadVentas: number;
}
