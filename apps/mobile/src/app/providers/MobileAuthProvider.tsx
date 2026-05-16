import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged, signInWithEmailAndPassword, signOut } from '@firebase/auth';
import type { CurrentUser, UserRole } from '@audidisc/shared';
import { isAdminRole, permissionsForRole } from '@audidisc/shared';

import { getMobileAuth } from '@infra/firebase/firebaseAuth';

type MobileAuthValue = {
  user: CurrentUser | null;
  idToken: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  authEnabled: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const MobileAuthContext = createContext<MobileAuthValue | null>(null);
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;

function isRole(value: unknown): value is UserRole {
  return value === 'Administrador' || value === 'Vendedor';
}

function sessionTimeRemaining(tokenResult: { authTime?: string; claims: Record<string, unknown> }) {
  const claimAuthTime = tokenResult.claims.auth_time;
  const authTimeMs =
    typeof tokenResult.authTime === 'string'
      ? Date.parse(tokenResult.authTime)
      : typeof claimAuthTime === 'number'
        ? claimAuthTime * 1000
        : Date.now();
  return SESSION_TIMEOUT_MS - Math.max(0, Date.now() - authTimeMs);
}

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const auth = useMemo(() => getMobileAuth(), []);
  const authEnabled = Boolean(auth);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setIdToken(null);
      setLoading(false);
      return undefined;
    }

    let sessionTimer: ReturnType<typeof setTimeout> | null = null;
    const clearSessionTimer = () => {
      if (sessionTimer) {
        clearTimeout(sessionTimer);
        sessionTimer = null;
      }
    };
    const unsubscribe = onIdTokenChanged(auth, currentUser => {
      void (async () => {
        setLoading(true);
        clearSessionTimer();
        if (!currentUser) {
          setUser(null);
          setIdToken(null);
          setLoading(false);
          return;
        }

        const [token, tokenResult] = await Promise.all([
          currentUser.getIdToken(),
          currentUser.getIdTokenResult(true),
        ]);
        const remainingMs = sessionTimeRemaining(tokenResult);
        if (remainingMs <= 0) {
          setError('Sesion expirada por seguridad. Vuelve a iniciar sesion.');
          setUser(null);
          setIdToken(null);
          setLoading(false);
          await signOut(auth);
          return;
        }
        const role = isRole(tokenResult.claims.role) ? tokenResult.claims.role : 'Vendedor';
        const roleIdClaim = tokenResult.claims.roleId;
        const rawPermissions = tokenResult.claims.permissions;
        const permissions = permissionsForRole(
          role,
          Array.isArray(rawPermissions) ? rawPermissions.map(String) : null,
        );
        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          role,
          roleId: typeof roleIdClaim === 'string' ? roleIdClaim : role,
          permissions,
        });
        setIdToken(token);
        sessionTimer = setTimeout(() => {
          setError('Sesion expirada por seguridad. Vuelve a iniciar sesion.');
          void signOut(auth);
        }, remainingMs);
        setLoading(false);
      })().catch(() => {
        setError('No se pudo validar la sesion movil.');
        setUser(null);
        setIdToken(null);
        setLoading(false);
      });
    });

    return () => {
      clearSessionTimer();
      unsubscribe();
    };
  }, [auth]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!auth) {
        setError('Firebase Auth no esta configurado en la app movil.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion.');
        setLoading(false);
      }
    },
    [auth],
  );

  const logout = useCallback(async () => {
    if (!auth) {
      setUser(null);
      setIdToken(null);
      return;
    }
    await signOut(auth);
  }, [auth]);

  const value = useMemo(
    () => ({
      user,
      idToken,
      isAdmin: isAdminRole(user?.role),
      isLoading,
      authEnabled,
      error,
      login,
      logout,
      clearError: () => setError(null),
    }),
    [authEnabled, error, idToken, isLoading, login, logout, user],
  );

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}

export function useMobileAuth() {
  const context = useContext(MobileAuthContext);
  if (!context) {
    throw new Error('useMobileAuth must be used within MobileAuthProvider');
  }
  return context;
}
