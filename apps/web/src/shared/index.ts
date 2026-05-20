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

export type InventoryHealthQuadrant =
  | 'sin-stock'
  | 'motores-rentabilidad'
  | 'generadores-trafico'
  | 'capital-estancado-rentable'
  | 'stock-muerto-riesgo';

export type InventoryHealthColorStatus = 'dead-stock' | 'never-sold' | 'stale' | 'watch' | 'healthy';

export interface InventoryHealthItem {
  productoId: string;
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  stockActual: number;
  autonomiaDias: number;
  autonomiaDiasRaw: number | null;
  velocidadVentaDiaria: number;
  roiInventarioPorcentaje: number;
  capitalInmovilizadoCentavos: number;
  recenciaDias: number | null;
  ultimaVentaFecha: string | null;
  cantidadVendida90: number;
  cantidadVendidaTotal: number;
  utilidadHistoricaCentavos: number;
  quadrant: InventoryHealthQuadrant;
  colorStatus: InventoryHealthColorStatus;
  sinDemanda90: boolean;
  isDeadStockRisk: boolean;
}

export interface InventoryHealthResponse {
  generatedAt: string;
  lookbackDias: number;
  thresholds: {
    autonomiaAltaDias: number;
    roiBajoPorcentaje: number;
    autonomiaCapDias: number;
  };
  totalProductos: number;
  items: InventoryHealthItem[];
}

export interface ParetoMarginItem {
  categoria: string;
  ingresosCentavos: number;
  utilidadCentavos: number;
  cantidadVendida: number;
  tickets: number;
  ingresoPorcentaje: number;
  margenGananciaPorcentaje: number;
  utilidadPorcentaje: number;
  cumulativeUtilidadPorcentaje: number;
  volumenRelativo: number;
  paretoClass: 'A' | 'B' | 'C';
}

export interface ParetoMarginResponse {
  generatedAt: string;
  totalIngresosCentavos: number;
  totalUtilidadCentavos: number;
  items: ParetoMarginItem[];
}

export interface PriceWaterfallStep {
  id: string;
  label: string;
  kind: 'anchor' | 'negative' | 'total';
  deltaCentavos: number;
  startCentavos: number;
  endCentavos: number;
  runningTotalCentavos: number;
}

export interface PriceWaterfallResponse {
  generatedAt: string;
  month: string;
  summary: {
    ingresoPotencialCentavos: number;
    ingresoRealCentavos: number;
    descuentosCentavos: number;
    comisionesCentavos: number;
    cogsCentavos: number;
    utilidadNetaCentavos: number;
  };
  steps: PriceWaterfallStep[];
}

export interface SalesHeatmapCell {
  x: string;
  y: number;
  tickets: number;
  utilidadCentavos: number;
  totalCentavos: number;
}

export interface SalesHeatmapRow {
  id: string;
  data: SalesHeatmapCell[];
}

export interface SalesHeatmapResponse {
  generatedAt: string;
  hours: string[];
  weekdays: string[];
  maxTickets: number;
  maxUtilidadCentavos: number;
  data: SalesHeatmapRow[];
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

export type PermissionKey =
  | 'inventory'
  | 'inventory_write'
  | 'sales'
  | 'customers'
  | 'reports'
  | 'history'
  | 'analytics'
  | 'audit'
  | 'users'
  | 'style'
  | 'financials';

export type UserRole = string;

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  zone: string;
  description: string;
}

export interface RoleAccess {
  id: string;
  nombre: string;
  descripcion: string | null;
  permissions: PermissionKey[];
  system: boolean;
  estado: boolean;
  updatedAt: string | null;
}

export interface ManagedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  role: string;
  roleId: string;
  permissions: PermissionKey[];
  lastSignInAt: string | null;
  createdAt: string | null;
}

export interface RoleCreateInput {
  nombre: string;
  descripcion?: string | null;
  permissions: PermissionKey[];
}

export interface RoleUpdateInput {
  nombre?: string;
  descripcion?: string | null;
  permissions?: PermissionKey[];
  estado?: boolean;
}

export interface UserCreateInput {
  email: string;
  password: string;
  displayName?: string | null;
  roleId: string;
}

export interface CurrentUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  roleId?: string | null;
  permissions: PermissionKey[];
}

export const ADMIN_ROLE: UserRole = 'Administrador';
export const SELLER_ROLE: UserRole = 'Vendedor';

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'inventory',
    label: 'Inventario',
    zone: 'Operacion',
    description: 'Ver productos, stock y disponibilidad operativa.',
  },
  {
    key: 'inventory_write',
    label: 'Gestionar inventario',
    zone: 'Operacion',
    description: 'Crear productos, editar fichas y ajustar stock.',
  },
  {
    key: 'sales',
    label: 'Ventas POS',
    zone: 'Caja',
    description: 'Entrar al punto de venta y registrar ventas.',
  },
  {
    key: 'customers',
    label: 'Clientes',
    zone: 'Comercial',
    description: 'Ver, crear y actualizar clientes.',
  },
  {
    key: 'reports',
    label: 'Reportes',
    zone: 'Direccion',
    description: 'Acceder al dashboard de reportes y exportaciones permitidas.',
  },
  {
    key: 'history',
    label: 'Ventas pasadas',
    zone: 'Direccion',
    description: 'Consultar historiales de ventas y anular operaciones.',
  },
  {
    key: 'analytics',
    label: 'BI',
    zone: 'Direccion',
    description: 'Ver analitica avanzada, Pareto, margenes e inventario inteligente.',
  },
  {
    key: 'audit',
    label: 'Auditoria',
    zone: 'Seguridad',
    description: 'Revisar trazabilidad de cambios sensibles.',
  },
  {
    key: 'users',
    label: 'Usuarios y roles',
    zone: 'Seguridad',
    description: 'Crear usuarios, roles y asignar zonas.',
  },
  {
    key: 'style',
    label: 'Guia de estilo',
    zone: 'Sistema',
    description: 'Ver el referente visual y componentes base del panel.',
  },
  {
    key: 'financials',
    label: 'Costos y utilidad',
    zone: 'Finanzas',
    description: 'Ver costos de compra, margenes y utilidad neta.',
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_DEFINITIONS.map(permission => permission.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<'Administrador' | 'Vendedor', PermissionKey[]> = {
  Administrador: ALL_PERMISSION_KEYS,
  Vendedor: ['inventory', 'sales', 'customers'],
};

export function isAdminRole(role: UserRole | string | null | undefined): role is 'Administrador' {
  return role === ADMIN_ROLE;
}

export function permissionsForRole(role: UserRole | null | undefined, permissions?: readonly string[] | null): PermissionKey[] {
  const allowed = new Set(ALL_PERMISSION_KEYS);
  const explicit = (permissions ?? []).filter((permission): permission is PermissionKey =>
    allowed.has(permission as PermissionKey),
  );
  if (explicit.length > 0) {
    return Array.from(new Set(explicit));
  }
  if (role === ADMIN_ROLE) {
    return DEFAULT_ROLE_PERMISSIONS.Administrador;
  }
  if (role === SELLER_ROLE) {
    return DEFAULT_ROLE_PERMISSIONS.Vendedor;
  }
  return [];
}

export function hasPermission(
  user: Pick<CurrentUser, 'role' | 'permissions'> | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!user) {
    return false;
  }
  return isAdminRole(user.role) || user.permissions.includes(permission);
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
