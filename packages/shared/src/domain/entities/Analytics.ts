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
