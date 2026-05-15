export const routes = {
  inventory: '/inventario',
  sales: '/ventas',
  customers: '/clientes',
  reports: '/reportes',
  history: '/historial',
  analytics: '/bi',
  audit: '/auditoria',
} as const;

export type AppRouteKey = keyof typeof routes;
