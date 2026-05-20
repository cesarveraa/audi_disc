import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  getAuth,
  onIdTokenChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { CurrentUser, PermissionKey } from '@audidisc/shared';
import { hasPermission, isAdminRole, permissionsForRole } from '@audidisc/shared';

import { AUTH_INVALID_EVENT, type AuthInvalidEvent } from '@app/authEvents';
import { getFirebaseApp } from '@infra/firebase/firebaseApp';

type AuthContextValue = {
  user: CurrentUser | null;
  isAdmin: boolean;
  canViewFinancials: boolean;
  canAccess: (permission: PermissionKey) => boolean;
  idToken: string | null;
  isLoading: boolean;
  authEnabled: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const configuredFirebaseAuthTimeoutMs = Number(import.meta.env.VITE_FIREBASE_AUTH_TIMEOUT_MS);
const FIREBASE_AUTH_TIMEOUT_MS =
  Number.isFinite(configuredFirebaseAuthTimeoutMs) && configuredFirebaseAuthTimeoutMs > 0
    ? configuredFirebaseAuthTimeoutMs
    : 10000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), FIREBASE_AUTH_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingSessionErrorRef = useRef<string | null>(null);
  const firebaseApp = useMemo(() => getFirebaseApp(), []);
  const authEnabled = Boolean(firebaseApp);

  useEffect(() => {
    if (!firebaseApp) {
      setUser(null);
      setIdToken(null);
      setLoading(false);
      return undefined;
    }

    const auth = getAuth(firebaseApp);
    void setPersistence(auth, browserLocalPersistence);
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
        const pendingSessionError = pendingSessionErrorRef.current;
        if (!pendingSessionError) {
          setError(null);
        }
        clearSessionTimer();
        if (!currentUser) {
          pendingSessionErrorRef.current = null;
          setUser(null);
          setIdToken(null);
          setError(pendingSessionError);
          setLoading(false);
          return;
        }

        const [token, tokenResult] = await Promise.all([
          withTimeout(currentUser.getIdToken(), 'Firebase tardo demasiado en entregar el token.'),
          withTimeout(currentUser.getIdTokenResult(), 'Firebase tardo demasiado en validar los permisos.'),
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
        const roleClaim = tokenResult.claims.role;
        const role = typeof roleClaim === 'string' && roleClaim.trim() ? roleClaim.trim() : 'Vendedor';
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
        pendingSessionErrorRef.current = null;
        setError(null);
        sessionTimer = setTimeout(() => {
          setError('Sesion expirada por seguridad. Vuelve a iniciar sesion.');
          void signOut(auth);
        }, remainingMs);
        setLoading(false);
      })().catch(() => {
        setError('No se pudo validar la sesion de Firebase.');
        setUser(null);
        setIdToken(null);
        setLoading(false);
      });
    });

    return () => {
      clearSessionTimer();
      unsubscribe();
    };
  }, [firebaseApp]);

  useEffect(() => {
    if (!firebaseApp) {
      return undefined;
    }

    const auth = getAuth(firebaseApp);
    const handleInvalidSession = (event: Event) => {
      const detail = (event as AuthInvalidEvent).detail;
      const serverMessage = typeof detail?.message === 'string' ? detail.message : '';
      const nextMessage = serverMessage.includes('revoked')
        ? 'Sesion expirada o permisos actualizados. Vuelve a iniciar sesion.'
        : 'Sesion invalida. Vuelve a iniciar sesion.';
      pendingSessionErrorRef.current = nextMessage;
      setError(nextMessage);
      setUser(null);
      setIdToken(null);
      void signOut(auth);
    };

    window.addEventListener(AUTH_INVALID_EVENT, handleInvalidSession);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, handleInvalidSession);
  }, [firebaseApp]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!firebaseApp) {
        setError('Firebase Auth no esta configurado. Define VITE_FIREBASE_* para entrar.');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const auth = getAuth(firebaseApp);
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion.');
        setLoading(false);
      }
    },
    [firebaseApp],
  );

  const logout = useCallback(async () => {
    if (!firebaseApp) {
      setUser(null);
      setIdToken(null);
      return;
    }

    await signOut(getAuth(firebaseApp));
  }, [firebaseApp]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAdmin: isAdminRole(user?.role),
      canViewFinancials: hasPermission(user, 'financials'),
      canAccess: permission => hasPermission(user, permission),
      idToken,
      isLoading,
      authEnabled,
      error,
      login,
      logout,
      clearError: () => setError(null),
    }),
    [authEnabled, error, idToken, isLoading, login, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useRequiredAuth() {
  const context = useAuth();
  if (!context.user) {
    throw new Error('useRequiredAuth requires an authenticated user');
  }
  return {
    ...context,
    user: context.user,
  };
}
