import { getAuth } from 'firebase/auth';

import { getFirebaseApp } from '@infra/firebase/firebaseApp';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, '');

type ApiFetchOptions = Omit<RequestInit, 'body' | 'headers'> & {
  idToken?: string | null;
  json?: unknown;
  headers?: HeadersInit;
};

async function resolveToken(explicitToken: string | null | undefined) {
  if (explicitToken) {
    return explicitToken;
  }

  const app = getFirebaseApp();
  const currentUser = app ? getAuth(app).currentUser : null;
  return currentUser ? currentUser.getIdToken() : null;
}

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readServerMessage(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    if (payload?.detail) {
      return typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail);
    }
    if (payload?.message) {
      return String(payload.message);
    }
  }

  const text = await response.text().catch(() => '');
  return text || `HTTP ${response.status}`;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}) {
  const { idToken, json, headers, ...requestOptions } = options;
  const token = await resolveToken(idToken);
  if (!token) {
    throw new Error('Sesion Firebase requerida');
  }

  const requestHeaders = new Headers(headers);
  requestHeaders.set('Authorization', `Bearer ${token}`);
  if (json !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const url = apiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestOptions,
      headers: requestHeaders,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error('[AudiDisc Network]', requestOptions.method ?? 'GET', url, error.message);
    }
    throw error;
  }

  if (!response.ok) {
    const serverMessage = await readServerMessage(response.clone());
    console.error('[AudiDisc API]', requestOptions.method ?? 'GET', url, response.status, serverMessage);
    throw new Error(serverMessage);
  }

  return response;
}

export async function apiJson<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string, options: ApiFetchOptions = {}): Promise<Blob> {
  const response = await apiFetch(path, options);
  return response.blob();
}
