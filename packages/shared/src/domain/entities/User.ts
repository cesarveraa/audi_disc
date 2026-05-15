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
