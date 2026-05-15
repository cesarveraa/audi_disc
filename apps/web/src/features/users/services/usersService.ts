import type {
  ManagedUser,
  PermissionDefinition,
  RoleAccess,
  RoleCreateInput,
  RoleUpdateInput,
  UserCreateInput,
} from '@audidisc/shared';

import { apiJson } from '../../../api/client';

export async function fetchAccessBootstrap(params: { idToken: string | null }) {
  const [permissions, roles, users] = await Promise.all([
    apiJson<PermissionDefinition[]>('/access/permissions', { idToken: params.idToken }),
    apiJson<RoleAccess[]>('/access/roles', { idToken: params.idToken }),
    apiJson<ManagedUser[]>('/access/users', { idToken: params.idToken }),
  ]);
  return { permissions, roles, users };
}

export function createAccessRole(params: {
  idToken: string | null;
  payload: RoleCreateInput;
}): Promise<RoleAccess> {
  return apiJson<RoleAccess>('/access/roles', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}

export function updateAccessRole(params: {
  idToken: string | null;
  roleId: string;
  payload: RoleUpdateInput;
}): Promise<RoleAccess> {
  return apiJson<RoleAccess>(`/access/roles/${encodeURIComponent(params.roleId)}`, {
    idToken: params.idToken,
    method: 'PATCH',
    json: params.payload,
  });
}

export function createManagedUser(params: {
  idToken: string | null;
  payload: UserCreateInput;
}): Promise<ManagedUser> {
  return apiJson<ManagedUser>('/access/users', {
    idToken: params.idToken,
    method: 'POST',
    json: params.payload,
  });
}

export function updateManagedUserAccess(params: {
  idToken: string | null;
  uid: string;
  roleId: string;
}): Promise<ManagedUser> {
  return apiJson<ManagedUser>(`/access/users/${encodeURIComponent(params.uid)}/access`, {
    idToken: params.idToken,
    method: 'PATCH',
    json: { roleId: params.roleId },
  });
}
