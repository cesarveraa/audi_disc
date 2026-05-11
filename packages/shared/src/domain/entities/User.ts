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

