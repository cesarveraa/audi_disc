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

export type PaymentMethod = 'Efectivo' | 'QR' | 'Transferencia';

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

export interface StockAlert {
  producto: ProductPublic;
  severity: 'critical' | 'warning';
}

export interface DashboardSummary {
  ventasHoy: {
    totalCentavos: number;
    cantidadVentas: number;
    ticketPromedioCentavos: number;
    utilidadCentavos?: number;
  };
  stockBajo: StockAlert[];
}

export interface WeeklyRevenuePoint {
  fechaLocal: string;
  totalCentavos: number;
  cantidadVentas: number;
  utilidadCentavos?: number;
}

export interface YearComparisonPoint {
  mes: number;
  label: string;
  currentYear: number;
  previousYear: number;
  currentTotalCentavos: number;
  previousTotalCentavos: number;
  deltaPorcentaje: number;
}

export interface TopProductMetric {
  productoId: string;
  nombre: string;
  cantidadVendida: number;
  totalCentavos: number;
  utilidadCentavos?: number;
}

export interface TopCustomerMetric {
  clienteId: string | null;
  nombre: string;
  telefono?: string | null;
  cantidadCompras: number;
  totalCentavos: number;
  utilidadCentavos?: number;
}

export interface ReportsDashboard {
  ventasHoy: {
    totalCentavos: number;
    cantidadVentas: number;
    ticketPromedioCentavos: number;
    utilidadCentavos?: number;
    margenPorcentaje?: number;
  };
  ingresosSemanales: WeeklyRevenuePoint[];
  stockBajo: StockAlert[];
  comparativaInteranual: YearComparisonPoint[];
  topProductos: TopProductMetric[];
  topClientes: TopCustomerMetric[];
}

export interface SalesHistory {
  dateFrom: string;
  dateTo: string;
  totalCentavos: number;
  cantidadVentas: number;
  utilidadCentavos?: number;
  margenPorcentaje?: number;
  ventas: Sale[];
}

export type AuditAction = 'UPDATE' | 'DELETE' | 'PRICE_CHANGE' | 'STOCK_ADJUST';

export interface AuditLog {
  id: string;
  userId: string;
  userEmail?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  previous_data: Record<string, unknown>;
  new_data: Record<string, unknown>;
  timestamp: string | null;
}

export interface AuditLogsPage {
  items: AuditLog[];
  total_count: number;
  has_more: boolean;
}

export interface ParetoProductMetric {
  productoId: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  cantidadVendida: number;
  totalCentavos: number;
  utilidadCentavos: number;
  revenueSharePorcentaje: number;
  cumulativeSharePorcentaje: number;
  isTopTwenty: boolean;
  paretoClass: 'A' | 'B' | 'C';
}

export interface MonthlySalesTrend {
  mes: string;
  label: string;
  totalCentavos: number;
  utilidadCentavos: number;
  cantidadVentas: number;
  audifonosCantidad: number;
  audifonosCentavos: number;
}

export interface HeadphoneSeasonality {
  mes: string;
  label: string;
  cantidad: number;
  totalCentavos: number;
}

export interface ReorderAlert {
  productoId: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  stockActual: number;
  demandaMediaDiaria: number;
  tiempoEntregaDias: number;
  stockSeguridad: number;
  reorderPoint: number;
  sugerenciaCompra: number;
}

export interface DeadStockItem {
  productoId: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  stockActual: number;
  ultimaVentaFecha: string | null;
  diasSinVenta: number | null;
  valorInventarioCentavos: number;
}

export interface AnalyticsDashboard {
  generatedAt: string;
  pareto: {
    totalProductos: number;
    topTwentyCount: number;
    topTwentyRevenueSharePorcentaje: number;
    items: ParetoProductMetric[];
  };
  tendencias: {
    ventasPorMes: MonthlySalesTrend[];
    mesesFuertesAudifonos: HeadphoneSeasonality[];
  };
  margenes: {
    ingresosCentavos: number;
    costoCentavos: number;
    utilidadNetaCentavos: number;
    margenPorcentaje: number;
    ventasAnalizadas: number;
  };
  inventario: {
    leadTimeDias: number;
    lookbackDiasDemanda: number;
    reorderAlerts: ReorderAlert[];
    deadStock: DeadStockItem[];
  };
}

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

export type UserRole = 'Administrador' | 'Vendedor';

export interface CurrentUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
}

export const ADMIN_ROLE: UserRole = 'Administrador';
export const SELLER_ROLE: UserRole = 'Vendedor';

export function isAdminRole(role: UserRole | string | null | undefined): role is 'Administrador' {
  return role === ADMIN_ROLE;
}

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

export function cents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Money value must be finite');
  }
  return Math.round(value * 100);
}

export function formatBsFromCentavos(value: number): string {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    minimumFractionDigits: 2,
  }).format(value / 100);
}

export function calculateChangeCentavos(recibidoCentavos: number, totalCentavos: number): number {
  return recibidoCentavos - totalCentavos;
}
