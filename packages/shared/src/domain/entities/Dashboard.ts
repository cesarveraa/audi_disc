import type { ProductPublic } from './Product';
import type { Sale } from './Sale';

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
