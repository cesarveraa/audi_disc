import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  currentUser: {
    getIdToken: vi.fn(),
  },
  getAuth: vi.fn(),
  getFirebaseApp: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseMocks.getAuth,
}));

vi.mock('@infra/firebase/firebaseApp', () => ({
  getFirebaseApp: firebaseMocks.getFirebaseApp,
}));

async function loadClient() {
  vi.resetModules();
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.audidisc.test');
  return import('./client');
}

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function authorizationHeader(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return (init.headers as Headers).get('Authorization');
}

describe('apiFetch auth token handling', () => {
  beforeEach(() => {
    firebaseMocks.currentUser.getIdToken.mockReset();
    firebaseMocks.getAuth.mockReset();
    firebaseMocks.getFirebaseApp.mockReset();
    firebaseMocks.getFirebaseApp.mockReturnValue({ name: 'audidisc-test-app' });
    firebaseMocks.getAuth.mockReturnValue({ currentUser: firebaseMocks.currentUser });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('prefers a fresh Firebase SDK token over the token stored in React state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    firebaseMocks.currentUser.getIdToken.mockResolvedValue('fresh-sdk-token');
    const { apiFetch } = await loadClient();

    await apiFetch('/productos', { idToken: 'stale-react-token' });

    expect(firebaseMocks.currentUser.getIdToken).toHaveBeenCalledWith(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authorizationHeader(fetchMock, 0)).toBe('Bearer fresh-sdk-token');
  });

  it('retries a 401 once with a forced token refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Invalid or revoked Firebase token' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    firebaseMocks.currentUser.getIdToken.mockImplementation((forceRefresh?: boolean) =>
      Promise.resolve(forceRefresh ? 'forced-refresh-token' : 'cached-token'),
    );
    const { apiFetch } = await loadClient();

    await apiFetch('/sales/history');

    expect(firebaseMocks.currentUser.getIdToken).toHaveBeenCalledWith(false);
    expect(firebaseMocks.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorizationHeader(fetchMock, 0)).toBe('Bearer cached-token');
    expect(authorizationHeader(fetchMock, 1)).toBe('Bearer forced-refresh-token');
  });

  it('dispatches an auth invalid event when a refreshed token is still rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Invalid or revoked Firebase token' }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'Invalid or revoked Firebase token' }));
    const invalidSessionListener = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.addEventListener('audidisc:auth-invalid', invalidSessionListener);
    firebaseMocks.currentUser.getIdToken.mockImplementation((forceRefresh?: boolean) =>
      Promise.resolve(forceRefresh ? 'forced-refresh-token' : 'cached-token'),
    );
    const { apiFetch } = await loadClient();

    await expect(apiFetch('/reports/dashboard')).rejects.toThrow('Invalid or revoked Firebase token');

    expect(invalidSessionListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('audidisc:auth-invalid', invalidSessionListener);
  });

  it('redacts validation inputs from thrown errors and API logs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(422, {
      detail: [
        {
          type: 'string_too_short',
          loc: ['body', 'password'],
          msg: 'String should have at least 8 characters',
          input: '1234',
          ctx: { min_length: 8 },
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    firebaseMocks.currentUser.getIdToken.mockResolvedValue('fresh-sdk-token');
    const { apiFetch } = await loadClient();

    try {
      await expect(apiFetch('/access/users', {
        method: 'POST',
        json: { email: 'nuevo@audidisc.local', password: '1234', roleId: 'vendedor' },
      })).rejects.toMatchObject({
        status: 422,
        message: 'Datos invalidos (password: String should have at least 8 characters)',
      });

      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('1234');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('"input"');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('can silence expected HTTP status logs while still throwing an API error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'Not Found' }));
    vi.stubGlobal('fetch', fetchMock);
    firebaseMocks.currentUser.getIdToken.mockResolvedValue('fresh-sdk-token');
    const { apiFetch } = await loadClient();

    try {
      await expect(apiFetch('/reports/sales-history', { silentStatuses: [404] })).rejects.toMatchObject({
        status: 404,
        message: 'Not Found',
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
