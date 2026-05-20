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
