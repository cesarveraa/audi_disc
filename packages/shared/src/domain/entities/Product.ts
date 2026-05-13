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
  imagenUrl: string | null;
  estado: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CatalogProduct {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precioVentaCentavos: number;
  imagenUrl: string | null;
}

export interface CatalogProductsPage {
  items: CatalogProduct[];
  total_count: number;
  has_more: boolean;
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

export function slugifyCatalogText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function createCatalogProductSlug(
  product: Pick<CatalogProduct, 'nombre' | 'marca'>,
  city = 'Sucre',
): string {
  const name = slugifyCatalogText(product.nombre);
  const brand = product.marca ? slugifyCatalogText(product.marca) : '';
  const citySlug = slugifyCatalogText(city);
  const nameHasBrand = Boolean(brand && name.includes(brand));
  return [name, nameHasBrand ? '' : brand, citySlug].filter(Boolean).join('-');
}

export function hasAdminFinancials(product: Product): product is ProductAdmin {
  return 'precioCompraCentavos' in product;
}
