import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { ManagedUser, PermissionDefinition, PermissionKey, RoleAccess } from '@audidisc/shared';
import { Check, KeyRound, Plus, RefreshCw, Save, ShieldCheck, UsersRound, X } from 'lucide-react';

import { AppSidebar } from '@app/navigation/AppSidebar';
import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';
import {
  createAccessRole,
  createManagedUser,
  fetchAccessBootstrap,
  updateAccessRole,
  updateManagedUserAccess,
} from '../services/usersService';

type RoleDraft = {
  nombre: string;
  descripcion: string;
  permissions: PermissionKey[];
};

const initialRoleDraft: RoleDraft = {
  nombre: '',
  descripcion: '',
  permissions: ['inventory'],
};

function byZone(permissions: PermissionDefinition[]) {
  return permissions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
    groups[permission.zone] = [...(groups[permission.zone] ?? []), permission];
    return groups;
  }, {});
}

function togglePermission(list: PermissionKey[], permission: PermissionKey) {
  return list.includes(permission) ? list.filter(item => item !== permission) : [...list, permission];
}

function AccessModal({
  children,
  eyebrow,
  icon,
  isOpen,
  onClose,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  icon: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm">
      <section
        className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-panel border border-white/70 bg-white shadow-2xl dark:border-white/10 dark:bg-[#17171a]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-audi-red text-white">
              {icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">{eyebrow}</p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">{title}</h2>
            </div>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
            aria-label="Cerrar modal"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[calc(92vh-80px)] overflow-y-auto px-5 py-5">
          {children}
        </div>
      </section>
    </div>
  );
}

export default function UsersAccessScreen() {
  const { idToken, logout, user } = useRequiredAuth();
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [roles, setRoles] = useState<RoleAccess[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(initialRoleDraft);
  const [userDraft, setUserDraft] = useState({ email: '', password: '', displayName: '', roleId: 'vendedor' });
  const [isRoleModalOpen, setRoleModalOpen] = useState(false);
  const [isUserModalOpen, setUserModalOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAccess() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccessBootstrap({ idToken });
      setPermissions(data.permissions);
      setRoles(data.roles);
      setUsers(data.users);
      setSelectedRoles(Object.fromEntries(data.users.map(item => [item.uid, item.roleId])));
      setUserDraft(current => ({
        ...current,
        roleId: data.roles.find(role => role.id === current.roleId)?.id ?? data.roles[0]?.id ?? 'vendedor',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar usuarios y roles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccess();
  }, [idToken]);

  const groupedPermissions = useMemo(() => byZone(permissions), [permissions]);
  const activeRoles = roles.filter(role => role.estado);

  async function handleCreateRole() {
    if (!roleDraft.nombre.trim() || !roleDraft.permissions.length) {
      setError('El rol necesita nombre y al menos una zona activa.');
      return;
    }
    setSaving('new-role');
    setError(null);
    setMessage(null);
    try {
      const role = await createAccessRole({
        idToken,
        payload: {
          nombre: roleDraft.nombre.trim(),
          descripcion: roleDraft.descripcion.trim() || null,
          permissions: roleDraft.permissions,
        },
      });
      setRoles(current => [...current, role].sort((left, right) => left.nombre.localeCompare(right.nombre, 'es')));
      setRoleDraft(initialRoleDraft);
      setRoleModalOpen(false);
      setMessage(`Rol ${role.nombre} creado.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el rol.');
    } finally {
      setSaving(null);
    }
  }

  async function handleRolePermissions(role: RoleAccess, permissions: PermissionKey[]) {
    setSaving(`role-${role.id}`);
    setError(null);
    setMessage(null);
    try {
      const nextRole = await updateAccessRole({
        idToken,
        roleId: role.id,
        payload: { permissions },
      });
      setRoles(current => current.map(item => (item.id === role.id ? nextRole : item)));
      setMessage(`Permisos actualizados para ${nextRole.nombre}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el rol.');
    } finally {
      setSaving(null);
    }
  }

  async function handleCreateUser() {
    if (!userDraft.email.trim() || !userDraft.password.trim()) {
      setError('Completa email y password temporal.');
      return;
    }
    setSaving('new-user');
    setError(null);
    setMessage(null);
    try {
      const nextUser = await createManagedUser({
        idToken,
        payload: {
          email: userDraft.email.trim(),
          password: userDraft.password,
          displayName: userDraft.displayName.trim() || null,
          roleId: userDraft.roleId,
        },
      });
      setUsers(current => [nextUser, ...current]);
      setSelectedRoles(current => ({ ...current, [nextUser.uid]: nextUser.roleId }));
      setUserDraft(current => ({ email: '', password: '', displayName: '', roleId: current.roleId }));
      setUserModalOpen(false);
      setMessage(`Usuario ${nextUser.email} creado con rol ${nextUser.role}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setSaving(null);
    }
  }

  async function handleAssignRole(managedUser: ManagedUser) {
    const roleId = selectedRoles[managedUser.uid] ?? managedUser.roleId;
    setSaving(`user-${managedUser.uid}`);
    setError(null);
    setMessage(null);
    try {
      const nextUser = await updateManagedUserAccess({ idToken, uid: managedUser.uid, roleId });
      setUsers(current => current.map(item => (item.uid === managedUser.uid ? nextUser : item)));
      setMessage(`Acceso actualizado para ${nextUser.email ?? nextUser.uid}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="ad-page">
      <div className="ad-shell">
        <AppSidebar active="users" user={user} onLogout={logout} />

        <section className="ad-content min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Seguridad</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-5xl">
                Usuarios y roles
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500 dark:text-white/55">
                Crea roles por zonas, asigna accesos y mantiene el panel blindado desde Firebase custom claims.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <AppButton
                variant="neutral"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setRoleDraft(initialRoleDraft);
                  setRoleModalOpen(true);
                }}
              >
                Nuevo rol
              </AppButton>
              <AppButton
                variant="primary"
                icon={<UsersRound className="h-4 w-4" />}
                onClick={() => {
                  setUserDraft(current => ({
                    email: '',
                    password: '',
                    displayName: '',
                    roleId: activeRoles.find(role => role.id === current.roleId)?.id ?? activeRoles[0]?.id ?? 'vendedor',
                  }));
                  setUserModalOpen(true);
                }}
              >
                Nuevo usuario
              </AppButton>
              <AppButton variant="neutral" icon={<RefreshCw className="h-4 w-4" />} isLoading={isLoading} onClick={() => void loadAccess()}>
                Actualizar
              </AppButton>
            </div>
          </header>

          {error && <div className="mb-5 rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">{error}</div>}
          {message && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              {message}
            </div>
          )}

          <section className="mb-5 grid gap-4 md:grid-cols-3">
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Roles activos</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950 dark:text-white">{activeRoles.length}</strong>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <span className="text-sm font-semibold text-gray-500 dark:text-white/55">Usuarios registrados</span>
              <strong className="mt-2 block text-3xl font-semibold text-gray-950 dark:text-white">{users.length}</strong>
            </article>
            <article className="rounded-panel border border-audi-red/20 bg-audi-red p-5 text-white shadow-button">
              <span className="text-sm font-semibold text-white/75">Zonas configurables</span>
              <strong className="mt-2 block text-3xl font-semibold">{permissions.length}</strong>
            </article>
          </section>

          <section className="rounded-panel border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Roles existentes</p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Lista de zonas de acceso</h2>
              </div>
              <ShieldCheck className="h-7 w-7 text-audi-red" />
            </div>

            <div className="grid gap-4">
              {roles.map((role, index) => (
                <section key={role.id} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/10 dark:bg-white/[0.05]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gray-100 text-sm font-black text-gray-500 dark:bg-white/10 dark:text-white/55">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-950 dark:text-white">{role.nombre}</h3>
                          {role.system && <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-500 dark:bg-white/10 dark:text-white/55">Sistema</span>}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-white/55">{role.descripcion ?? 'Rol personalizado de Audi Disc.'}</p>
                      </div>
                    </div>
                    {!role.system && (
                      <AppButton
                        variant="neutral"
                        icon={<Save className="h-4 w-4" />}
                        isLoading={saving === `role-${role.id}`}
                        onClick={() => void handleRolePermissions(role, role.permissions)}
                      >
                        Guardar permisos
                      </AppButton>
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {permissions.map(permission => {
                      const active = role.permissions.includes(permission.key);
                      return (
                        <button
                          key={`${role.id}-${permission.key}`}
                          type="button"
                          disabled={role.system}
                          onClick={() =>
                            setRoles(current =>
                              current.map(item =>
                                item.id === role.id
                                  ? { ...item, permissions: togglePermission(item.permissions, permission.key) }
                                  : item,
                              ),
                            )
                          }
                          className={[
                            'min-h-16 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed',
                            active
                              ? 'border-audi-red bg-audi-red text-white shadow-button'
                              : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-audi-red dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55',
                          ].join(' ')}
                        >
                          <span className="flex items-center gap-2">
                            {active && <Check className="h-4 w-4" />}
                            {permission.label}
                          </span>
                          <span className="mt-1 block text-xs font-medium opacity-70">{permission.zone}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!roles.length && (
                <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/55">
                  {isLoading ? 'Cargando roles...' : 'No hay roles configurados.'}
                </div>
              )}
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-panel border border-white/70 bg-white/85 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-white/10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Firebase Auth</p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Usuarios registrados</h2>
              </div>
              <KeyRound className="h-6 w-6 text-audi-red" />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-[0.12em] text-gray-500 dark:bg-white/[0.04] dark:text-white/45">
                  <tr>
                    <th className="px-5 py-3">Usuario</th>
                    <th className="px-5 py-3">Rol actual</th>
                    <th className="px-5 py-3">Zonas</th>
                    <th className="px-5 py-3">Asignar rol</th>
                    <th className="px-5 py-3 text-right">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {users.map(item => (
                    <tr key={item.uid} className="align-top">
                      <td className="px-5 py-4">
                        <strong className="block text-gray-950 dark:text-white">{item.displayName ?? item.email ?? item.uid}</strong>
                        <span className="mt-1 block text-xs text-gray-500 dark:text-white/45">{item.email ?? item.uid}</span>
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-700 dark:text-white/70">{item.role}</td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-md flex-wrap gap-2">
                          {item.permissions.map(permission => (
                            <span key={`${item.uid}-${permission}`} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-500 dark:bg-white/10 dark:text-white/55">
                              {permissions.find(definition => definition.key === permission)?.label ?? permission}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={selectedRoles[item.uid] ?? item.roleId}
                          onChange={event => setSelectedRoles(current => ({ ...current, [item.uid]: event.target.value }))}
                          className="h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm font-semibold outline-none focus:border-audi-red dark:border-white/10 dark:bg-black/20"
                        >
                          {activeRoles.map(role => (
                            <option key={role.id} value={role.id}>{role.nombre}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <AppButton
                          variant="neutral"
                          icon={<Save className="h-4 w-4" />}
                          isLoading={saving === `user-${item.uid}`}
                          onClick={() => void handleAssignRole(item)}
                        >
                          Guardar
                        </AppButton>
                      </td>
                    </tr>
                  ))}
                  {!users.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-sm font-semibold text-gray-500 dark:text-white/55">
                        {isLoading ? 'Cargando usuarios...' : 'No hay usuarios registrados.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <AccessModal
            eyebrow="Nuevo rol"
            icon={<ShieldCheck className="h-5 w-5" />}
            isOpen={isRoleModalOpen}
            onClose={() => setRoleModalOpen(false)}
            title="Crear rol por zonas"
          >
            <div className="grid gap-4">
              <input
                value={roleDraft.nombre}
                onChange={event => setRoleDraft(current => ({ ...current, nombre: event.target.value }))}
                placeholder="Ej: Encargado de reportes"
                className="h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-audi-red dark:border-white/10 dark:bg-black/20"
              />
              <textarea
                value={roleDraft.descripcion}
                onChange={event => setRoleDraft(current => ({ ...current, descripcion: event.target.value }))}
                placeholder="Descripcion interna"
                className="min-h-24 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-audi-red dark:border-white/10 dark:bg-black/20"
              />
              <div className="grid gap-4">
                {Object.entries(groupedPermissions).map(([zone, items]) => (
                  <div key={zone} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">{zone}</span>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {items.map(permission => {
                        const active = roleDraft.permissions.includes(permission.key);
                        return (
                          <button
                            key={permission.key}
                            type="button"
                            onClick={() =>
                              setRoleDraft(current => ({
                                ...current,
                                permissions: togglePermission(current.permissions, permission.key),
                              }))
                            }
                            className={[
                              'rounded-full border px-3 py-2 text-xs font-bold transition',
                              active
                                ? 'border-audi-red bg-audi-red text-white'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-audi-red dark:border-white/10 dark:bg-transparent dark:text-white/55',
                            ].join(' ')}
                          >
                            {permission.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <footer className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 dark:border-white/10 sm:flex-row sm:justify-end">
                <AppButton variant="neutral" onClick={() => setRoleModalOpen(false)}>
                  Cancelar
                </AppButton>
                <AppButton variant="primary" icon={<Plus className="h-4 w-4" />} isLoading={saving === 'new-role'} onClick={() => void handleCreateRole()}>
                  Crear rol
                </AppButton>
              </footer>
            </div>
          </AccessModal>

          <AccessModal
            eyebrow="Nuevo usuario"
            icon={<UsersRound className="h-5 w-5" />}
            isOpen={isUserModalOpen}
            onClose={() => setUserModalOpen(false)}
            title="Crear usuario de acceso"
          >
            <div className="grid gap-4">
              <input
                value={userDraft.email}
                onChange={event => setUserDraft(current => ({ ...current, email: event.target.value }))}
                placeholder="correo@audidisc.com"
                className="h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-audi-red dark:border-white/10 dark:bg-black/20"
              />
              <input
                value={userDraft.displayName}
                onChange={event => setUserDraft(current => ({ ...current, displayName: event.target.value }))}
                placeholder="Nombre visible"
                className="h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-audi-red dark:border-white/10 dark:bg-black/20"
              />
              <input
                type="password"
                value={userDraft.password}
                onChange={event => setUserDraft(current => ({ ...current, password: event.target.value }))}
                placeholder="Password temporal"
                className="h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-audi-red dark:border-white/10 dark:bg-black/20"
              />
              <select
                value={userDraft.roleId}
                onChange={event => setUserDraft(current => ({ ...current, roleId: event.target.value }))}
                className="h-12 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-audi-red dark:border-white/10 dark:bg-black/20"
              >
                {activeRoles.map(role => (
                  <option key={role.id} value={role.id}>{role.nombre}</option>
                ))}
              </select>
              <footer className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 dark:border-white/10 sm:flex-row sm:justify-end">
                <AppButton variant="neutral" onClick={() => setUserModalOpen(false)}>
                  Cancelar
                </AppButton>
                <AppButton variant="primary" icon={<UsersRound className="h-4 w-4" />} isLoading={saving === 'new-user'} onClick={() => void handleCreateUser()}>
                  Crear usuario
                </AppButton>
              </footer>
            </div>
          </AccessModal>
        </section>
      </div>
    </main>
  );
}
