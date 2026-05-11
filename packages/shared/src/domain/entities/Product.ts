export type ProductStockStatus = 'inactive' | 'critical' | 'low' | 'healthy';

export interface ProductPublic {
  id: string;
  nombre: string;
  marca: string | null;
  sku: string | null;
  categoria: string | null;
  cantidad: number;
  stockMinimo: number;
  precioVentaCentavos: number;
  estado: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductAdmin extends ProductPublic {
  precioCompraCentavos: number;
  utilidadCentavos: number;
  margenPorcentaje: number;
}

export type Product = ProductPublic | ProductAdmin;

export interface ProductCreateInput {
  nombre: string;
  marca?: string | null;
  sku?: string | null;
  categoria?: string | null;
  cantidad: number;
  stockMinimo: number;
  precioCompraCentavos: number;
  precioVentaCentavos: number;
}

export type ProductUpdateInput = Partial<ProductCreateInput> & {
  estado?: boolean;
};

export function hasAdminFinancials(product: Product): product is ProductAdmin {
  return 'precioCompraCentavos' in product;
}

